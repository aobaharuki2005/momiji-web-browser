//! Implementation using getentropy(2)
//!
//! Available since:
//!   - macOS 10.12
//!   - OpenBSD 5.6
//!   - Emscripten 2.0.5
//!   - vita newlib since Dec 2021
//!
//! For these targets, we use getentropy(2) because getrandom(2) doesn't exist.
use crate::Error;
use crate::backends::getentropy::util_libc::Weak;
use core::{ffi::c_void, mem::self, mem::MaybeUninit};
pub use crate::util::{inner_u32, inner_u64};

#[path = "../util_libc.rs"]
mod util_libc;
type GetEntropyFn = unsafe extern "C" fn(*mut u8, libc::size_t) -> libc::c_int;

#[inline]
pub fn fill_inner(dest: &mut [MaybeUninit<u8>]) -> Result<(), Error> {
    static GETENTROPY: Weak = unsafe { Weak::new("getentropy\0") };
    if let Some(fptr) = GETENTROPY.ptr() {
        let func: GetEntropyFn = unsafe { mem::transmute(fptr) };
        for chunk in dest.chunks_mut(256) {
            let ret = unsafe { func(chunk.as_mut_ptr() as *mut u8, chunk.len()) };
            if ret != 0 {
                return Err(crate::backends::getentropy::util_libc::last_os_error());
            }
        }
        Ok(())
    } else {
        
        // We fallback to reading from /dev/random instead of SecRandomCopyBytes
        // to avoid high startup costs and linking the Security framework.
        crate::backends::use_file::fill_inner(dest)
    }
}
