/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Tile cache types and descriptors
//!
//! This module contains the core tile caching infrastructure including:
//! - Tile identification and coordinate types
//! - Tile descriptors that track primitive dependencies
//! - Comparison results for invalidation tracking

// Existing tile cache slice builder (was previously tile_cache.rs)
pub mod slice_builder;

use api::units::*;
use crate::intern::ItemUid;
use crate::internal_types::FrameId;
use peek_poke::PeekPoke;
use std::{marker, u32};
use std::sync::atomic::{AtomicUsize, Ordering};

pub use self::slice_builder::{
    TileCacheBuilder, TileCacheConfig,
    PictureCacheDebugInfo, SliceDebugInfo, DirtyTileDebugInfo, TileDebugInfo,
};

pub use api::units::TileOffset;
pub use api::units::TileRange as TileRect;

/// The maximum number of compositor surfaces that are allowed per picture cache. This
/// is an arbitrary number that should be enough for common cases, but low enough to
/// prevent performance and memory usage drastically degrading in pathological cases.
pub const MAX_COMPOSITOR_SURFACES: usize = 4;

/// The size in device pixels of a normal cached tile.
pub const TILE_SIZE_DEFAULT: DeviceIntSize = DeviceIntSize {
    width: 1024,
    height: 512,
    _unit: marker::PhantomData,
};

/// The size in device pixels of a tile for horizontal scroll bars
pub const TILE_SIZE_SCROLLBAR_HORIZONTAL: DeviceIntSize = DeviceIntSize {
    width: 1024,
    height: 32,
    _unit: marker::PhantomData,
};

/// The size in device pixels of a tile for vertical scroll bars
pub const TILE_SIZE_SCROLLBAR_VERTICAL: DeviceIntSize = DeviceIntSize {
    width: 32,
    height: 1024,
    _unit: marker::PhantomData,
};

/// The maximum size per axis of a surface, in DevicePixel coordinates.
/// Render tasks larger than this size are scaled down to fit, which may cause
/// some blurriness.
pub const MAX_SURFACE_SIZE: usize = 4096;

/// Used to get unique tile IDs, even when the tile cache is
/// destroyed between display lists / scenes.
static NEXT_TILE_ID: AtomicUsize = AtomicUsize::new(0);

/// A unique identifier for a tile. These are stable across display lists and
/// scenes.
#[derive(Debug, Copy, Clone, PartialEq, PartialOrd, Ord, Eq, Hash)]
#[cfg_attr(feature = "capture", derive(Serialize))]
#[cfg_attr(feature = "replay", derive(Deserialize))]
pub struct TileId(pub usize);

impl TileId {
    pub fn new() -> TileId {
        TileId(NEXT_TILE_ID.fetch_add(1, Ordering::Relaxed))
    }
}

// Internal function used by picture.rs for creating TileIds
#[doc(hidden)]
pub fn next_tile_id() -> usize {
    NEXT_TILE_ID.fetch_add(1, Ordering::Relaxed)
}

/// Uniquely identifies a tile within a picture cache slice
#[cfg_attr(feature = "capture", derive(Serialize))]
#[cfg_attr(feature = "replay", derive(Deserialize))]
#[derive(Debug, Copy, Clone, PartialEq, Hash, Eq)]
pub struct TileKey {
    // Tile index (x,y)
    pub tile_offset: TileOffset,
    // Sub-slice (z)
    pub sub_slice_index: SubSliceIndex,
}

/// An index into the prims array in a TileDescriptor.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "capture", derive(Serialize))]
#[cfg_attr(feature = "replay", derive(Deserialize))]
pub struct PrimitiveDependencyIndex(pub u32);

/// Defines which sub-slice (effectively a z-index) a primitive exists on within
/// a picture cache instance.
#[cfg_attr(feature = "capture", derive(Serialize))]
#[cfg_attr(feature = "replay", derive(Deserialize))]
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, PeekPoke)]
pub struct SubSliceIndex(pub u8);

impl SubSliceIndex {
    pub const DEFAULT: SubSliceIndex = SubSliceIndex(0);

    pub fn new(index: usize) -> Self {
        SubSliceIndex(index as u8)
    }

    /// Return true if this sub-slice is the primary sub-slice (for now, we assume
    /// that only the primary sub-slice may be opaque and support subpixel AA, for example).
    pub fn is_primary(&self) -> bool {
        self.0 == 0
    }

    /// Get an array index for this sub-slice
    pub fn as_usize(&self) -> usize {
        self.0 as usize
    }
}


/// Information about a primitive that is a dependency for a tile.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "capture", derive(Serialize))]
#[cfg_attr(feature = "replay", derive(Deserialize))]
pub struct PrimitiveDescriptor {
    pub prim_uid: ItemUid,
    pub prim_clip_box: PictureBox2D,
    // TODO(gw): These two fields could be packed as a u24/u8
    pub dep_offset: u32,
    pub dep_count: u32,
}

impl PartialEq for PrimitiveDescriptor {
    fn eq(&self, other: &Self) -> bool {
        const EPSILON: f32 = 0.001;

        if self.prim_uid != other.prim_uid {
            return false;
        }

        use euclid::approxeq::ApproxEq;
        if !self.prim_clip_box.min.x.approx_eq_eps(&other.prim_clip_box.min.x, &EPSILON) {
            return false;
        }
        if !self.prim_clip_box.min.y.approx_eq_eps(&other.prim_clip_box.min.y, &EPSILON) {
            return false;
        }
        if !self.prim_clip_box.max.x.approx_eq_eps(&other.prim_clip_box.max.x, &EPSILON) {
            return false;
        }
        if !self.prim_clip_box.max.y.approx_eq_eps(&other.prim_clip_box.max.y, &EPSILON) {
            return false;
        }

        if self.dep_count != other.dep_count {
            return false;
        }

        true
    }
}

impl PartialEq<PrimitiveDescriptor> for (&ItemUid, &PictureBox2D) {
    fn eq(&self, other: &PrimitiveDescriptor) -> bool {
        self.0 == &other.prim_uid && self.1 == &other.prim_clip_box
    }
}

/// Uniquely describes the content of this tile, in a way that can be
/// (reasonably) efficiently hashed and compared.
#[cfg_attr(any(feature="capture",feature="replay"), derive(Clone))]
#[cfg_attr(feature = "capture", derive(Serialize))]
#[cfg_attr(feature = "replay", derive(Deserialize))]
pub struct TileDescriptor {
    /// List of primitive instance unique identifiers. The uid is guaranteed
    /// to uniquely describe the content of the primitive template, while
    /// the other parameters describe the clip chain and instance params.
    pub prims: Vec<PrimitiveDescriptor>,

    /// Picture space rect that contains valid pixels region of this tile.
    pub local_valid_rect: PictureRect,

    /// The last frame this tile had its dependencies updated (dependency updating is
    /// skipped if a tile is off-screen).
    pub last_updated_frame_id: FrameId,

    /// Packed per-prim dependency information
    pub dep_data: Vec<u8>,
}

impl TileDescriptor {
    pub fn new() -> Self {
        TileDescriptor {
            local_valid_rect: PictureRect::zero(),
            dep_data: Vec::new(),
            prims: Vec::new(),
            last_updated_frame_id: FrameId::INVALID,
        }
    }

    /// Print debug information about this tile descriptor to a tree printer.
    pub fn print(&self, pt: &mut dyn crate::print_tree::PrintTreePrinter) {
        pt.new_level("current_descriptor".to_string());

        pt.new_level("prims".to_string());
        for prim in &self.prims {
            pt.new_level(format!("prim uid={}", prim.prim_uid.get_uid()));
            pt.add_item(format!("clip: p0={},{} p1={},{}",
                prim.prim_clip_box.min.x,
                prim.prim_clip_box.min.y,
                prim.prim_clip_box.max.x,
                prim.prim_clip_box.max.y,
            ));
            pt.end_level();
        }
        pt.end_level();

        pt.end_level();
    }

    /// Clear the dependency information for a tile, when the dependencies
    /// are being rebuilt.
    pub fn clear(&mut self) {
        self.local_valid_rect = PictureRect::zero();
        self.prims.clear();
        self.dep_data.clear();
    }
}
