/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::RawtestHarness;
use webrender::api::*;
use webrender::api::units::*;

struct SnapTestContext {
    root_spatial_id: SpatialId,
    test_size: FramebufferIntSize,
    font_size: f32,
    ahem_font_key: FontInstanceKey,
    offset: f32,
    expected_offset: i32,
}

enum SnapTestExpectation {
    Rect {
        expected_color: ColorU,
        expected_rect: DeviceIntRect,
        expected_offset: i32,
    }
}

type SnapTestFunction = fn(&mut DisplayListBuilder, &mut SnapTestContext) -> SnapTestExpectation;

struct SnapTest {
    name: &'static str,
    f: SnapTestFunction,
}

struct SnapVariation {
    offset: f32,
    expected: i32,
}

const MAGENTA_RECT: SnapTest = SnapTest {
    name: "clear",
    f: dl_clear,
};

// Types of snap tests
const TESTS: &[SnapTest; 2] = &[
    // Rectangle, no transform/scroll
    SnapTest {
        name: "rect",
        f: dl_simple_rect,
    },

    // Glyph, no transform/scroll
    SnapTest {
        name: "glyph",
        f: dl_simple_glyph,
    },
];

// Variants we will run for each snap test with expected float offset and raster difference
const VARIANTS: &[SnapVariation; 13] = &[
    SnapVariation {
        offset: 0.0,
        expected: 0,
    },
    SnapVariation {
        offset: 0.1,
        expected: 0,
    },
    SnapVariation {
        offset: 0.25,
        expected: 0,
    },
    SnapVariation {
        offset: 0.33,
        expected: 0,
    },
    SnapVariation {
        offset: 0.49,
        expected: 0,
    },
    SnapVariation {
        offset: 0.5,
        expected: 1,
    },
    SnapVariation {
        offset: 0.51,
        expected: 1,
    },
    SnapVariation {
        offset: -0.1,
        expected: 0,
    },
    SnapVariation {
        offset: -0.25,
        expected: 0,
    },
    SnapVariation {
        offset: -0.33,
        expected: 0,
    },
    SnapVariation {
        offset: -0.49,
        expected: 0,
    },
    SnapVariation {
        offset: -0.5,
        expected: 0,
    },
    SnapVariation {
        offset: -0.51,
        expected: -1,
    },
];

impl<'a> RawtestHarness<'a> {
    pub fn test_snapping(&mut self) {
        println!("\tsnapping test...");

        // Test size needs to be:
        // (a) as small as possible for performance
        // (b) a factor of 5 (ahem font baseline requirement)
        // (c) an even number (center placement of test render)
        let test_size = FramebufferIntSize::new(20, 20);
        let mut any_fails = false;

        // Load the ahem.css test font
        let font_bytes = include_bytes!("../../reftests/text/Ahem.ttf").into();
        let font_key = self.wrench.font_key_from_bytes(font_bytes, 0);
        let font_size = 0.5 * test_size.width as f32;
        let ahem_font_key = self.wrench.add_font_instance(
            font_key,
            font_size,
            FontInstanceFlags::empty(),
            Some(FontRenderMode::Alpha),
            SyntheticItalics::disabled(),
        );

        // Run each test
        for test in TESTS {
            for variant in VARIANTS {
                let mut ctx = SnapTestContext {
                    ahem_font_key,
                    font_size,
                    offset: variant.offset,
                    expected_offset: variant.expected,
                    root_spatial_id: SpatialId::root_scroll_node(self.wrench.root_pipeline_id),
                    test_size,
                };

                any_fails = !self.run_snap_test(test, &mut ctx);

                // Each test clears to a magenta rect before running the next test. This
                // ensures that if WR's invalidation logic would skip rendering a test due
                // to detection that it's the same output, we will still render it to test
                // the pixel snapping is actually correct
                assert!(self.run_snap_test(&MAGENTA_RECT, &mut ctx));
            }
        }

        assert!(!any_fails);
    }

    fn run_snap_test(
        &mut self,
        test: &SnapTest,
        ctx: &mut SnapTestContext,
    ) -> bool {
        let mut builder = DisplayListBuilder::new(self.wrench.root_pipeline_id);
        builder.begin();

        let expected = (test.f)(&mut builder, ctx);

        let pixels = self.render_display_list_and_get_pixels(
            builder,
            ctx.test_size,
        );
        let ok = validate_output(
            &pixels,
            expected,
            ctx.test_size,
        );

        if !ok {
            println!("FAIL {} [{}/{}]", test.name, ctx.offset, ctx.expected_offset);

            // enable to save output as png for debugging
            // use crate::png;
            // png::save(
            //     format!("snap_test_{}.png", test.name),
            //     pixels.clone(),
            //     ctx.test_size.cast_unit(),
            //     png::SaveSettings {
            //         flip_vertical: true,
            //         try_crop: false,
            //     },
            // );

            // enable to log output to console for debugging
            // for y in 0 .. ctx.test_size.height {
            //     for x in 0 .. ctx.test_size.width {
            //         let i = ((ctx.test_size.height - y - 1) * ctx.test_size.width + x) as usize * 4;
            //         let r = pixels[i+0];
            //         let g = pixels[i+1];
            //         let b = pixels[i+2];
            //         let a = pixels[i+3];
            //         print!("[{:2x},{:2x},{:2x},{:2x}], ", r, g, b, a);
            //     }
            //     print!("\n");
            // }
        }

        ok
    }
}

fn validate_output(
    pixels: &[u8],
    expected: SnapTestExpectation,
    frame_buffer_size: FramebufferIntSize,
) -> bool {
    match expected {
        SnapTestExpectation::Rect { expected_color, expected_rect, expected_offset } => {
            let expected_rect = expected_rect.translate(
                DeviceIntVector2D::new(0, expected_offset)
            );

            for y in 0 .. frame_buffer_size.height {
                for x in 0 .. frame_buffer_size.width {
                    let i = ((frame_buffer_size.height - y - 1) * frame_buffer_size.width + x) as usize * 4;
                    let actual = ColorU::new(
                        pixels[i+0],
                        pixels[i+1],
                        pixels[i+2],
                        pixels[i+3],
                    );

                    let expected = if expected_rect.contains(DeviceIntPoint::new(x, y)) {
                        expected_color
                    } else {
                        ColorU::new(255, 255, 255, 255)
                    };

                    if expected != actual {
                        println!("FAILED at ({}, {}):", x, y);
                        println!("\tExpected [{:2x},{:2x},{:2x},{:2x}]",
                            expected.r,
                            expected.g,
                            expected.b,
                            expected.a,
                        );
                        println!("\tGot      [{:2x},{:2x},{:2x},{:2x}]",
                            actual.r,
                            actual.g,
                            actual.b,
                            actual.a,
                        );
                        return false;
                    }
                }
            }

            true
        }
    }
}

fn dl_clear(
    builder: &mut DisplayListBuilder,
    ctx: &mut SnapTestContext,
) -> SnapTestExpectation {
    let color = ColorF::new(1.0, 0.0, 1.0, 1.0);

    let bounds = ctx.test_size
        .to_f32()
        .cast_unit()
        .into();

    builder.push_rect(
        &CommonItemProperties {
            clip_rect: bounds,
            clip_chain_id: ClipChainId::INVALID,
            spatial_id: ctx.root_spatial_id,
            flags: PrimitiveFlags::default(),
        },
        bounds,
        color,
    );

    SnapTestExpectation::Rect {
        expected_color: color.into(),
        expected_rect: ctx.test_size.cast_unit().into(),
        expected_offset: 0,
    }
}

// Draw a centered rect
fn dl_simple_rect(
    builder: &mut DisplayListBuilder,
    ctx: &mut SnapTestContext
) -> SnapTestExpectation {
    let color = ColorF::BLACK;

    let prim_size = DeviceIntSize::new(
        ctx.test_size.width / 2,
        ctx.test_size.height / 2
    );

    let rect = DeviceIntRect::from_origin_and_size(
        DeviceIntPoint::new(
            (ctx.test_size.width - prim_size.width) / 2,
            (ctx.test_size.height - prim_size.height) / 2,
        ),
        prim_size,
    );

    let bounds = rect
        .to_f32()
        .cast_unit()
        .translate(
            LayoutVector2D::new(0.0, ctx.offset)
        );

    builder.push_rect(
        &CommonItemProperties {
            clip_rect: bounds,
            clip_chain_id: ClipChainId::INVALID,
            spatial_id: ctx.root_spatial_id,
            flags: PrimitiveFlags::default(),
        },
        bounds,
        color,
    );

    SnapTestExpectation::Rect {
        expected_color: color.into(),
        expected_rect: rect,
        expected_offset: ctx.expected_offset,
    }
}

// Draw a centered glyph with ahem.css font
fn dl_simple_glyph(
    builder: &mut DisplayListBuilder,
    ctx: &mut SnapTestContext,
) -> SnapTestExpectation {
    let color = ColorF::BLACK;

    let prim_size = DeviceIntSize::new(
        ctx.test_size.width / 2,
        ctx.test_size.height / 2
    );

    let rect = DeviceIntRect::from_origin_and_size(
        DeviceIntPoint::new(
            (ctx.test_size.width - prim_size.width) / 2,
            (ctx.test_size.height - prim_size.height) / 2,
        ),
        prim_size,
    );

    let bounds = rect
        .to_f32()
        .cast_unit()
        .translate(
            LayoutVector2D::new(0.0, ctx.offset)
        );

    builder.push_text(
        &CommonItemProperties {
            clip_rect: bounds,
            clip_chain_id: ClipChainId::INVALID,
            spatial_id: ctx.root_spatial_id,
            flags: PrimitiveFlags::default(),
        },
        bounds,
        &[
            GlyphInstance {
                index: 0x41,
                point: LayoutPoint::new(
                    bounds.min.x,
                    // ahem.css font has baseline at 0.8em
                    bounds.min.y + ctx.font_size * 0.8,
                ),
            }
        ],
        ctx.ahem_font_key,
        color,
        None,
    );

    SnapTestExpectation::Rect {
        expected_color: color.into(),
        expected_rect: rect,
        expected_offset: ctx.expected_offset,
    }
}
