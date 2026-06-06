use libc::clockid_t;
use std::str::*;

//adding the declarations from fallback, because we'll need it for <10.12
use std::convert::TryInto;
use std::time::Instant;

use once_cell::sync::Lazy;

static INIT_TIME: Lazy<Instant> = Lazy::new(Instant::now);


//rip cubeb-audio's macro check because we need to fallback on OS X < 10.12
const MACOS_KERNEL_MAJOR_VERSION_SIERRA: u32 = 16;

#[derive(Debug, PartialOrd, PartialEq)]
enum ParseMacOSKernelVersionError {
    SysCtl,
    Malformed,
    Parsing,
}

//rip cubeb-audio's macro check because we need to fallback on OS X < 10.12
fn macos_kernel_major_version() -> std::result::Result<u32, ParseMacOSKernelVersionError> {
    let ver = whatsys::kernel_version();
    if ver.is_none() {
        return Err(ParseMacOSKernelVersionError::SysCtl);
    }
    let ver = ver.unwrap();
    let major = ver.split('.').next();
    if major.is_none() {
        return Err(ParseMacOSKernelVersionError::Malformed);
    }
    let parsed_major = u32::from_str(major.unwrap());
    if parsed_major.is_err() {
        return Err(ParseMacOSKernelVersionError::Parsing);
    }
    Ok(parsed_major.unwrap())
}


extern "C" {
    fn clock_gettime_nsec_np(clock_id: clockid_t) -> u64;
}

const CLOCK_MONOTONIC_RAW: clockid_t = 4;
const CLOCK_UPTIME_RAW: clockid_t = 8;

/// The time from a clock that increments monotonically,
/// tracking the time since an arbitrary point.
///
/// See [`clock_gettime_nsec_np`].
///
/// [`clock_gettime_nsec_np`]: https://opensource.apple.com/source/Libc/Libc-1158.1.2/gen/clock_gettime.3.auto.html
pub fn now_including_suspend() -> u64 {
    if macos_kernel_major_version() >= Ok(MACOS_KERNEL_MAJOR_VERSION_SIERRA)
    {
        unsafe { 
            clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW) 
        }
    }
    else
    {
        let d = INIT_TIME.elapsed();
        d.as_millis().try_into().unwrap_or(0)
    }
}

/// The time from a clock that increments monotonically,
/// in the same manner as CLOCK_MONOTONIC_RAW,
/// but that does not increment while the system is asleep.
///
/// See `clock_gettime_nsec_np`.
pub fn now_awake() -> u64 {
    if macos_kernel_major_version() >= Ok(MACOS_KERNEL_MAJOR_VERSION_SIERRA)
    {
        unsafe { clock_gettime_nsec_np(CLOCK_UPTIME_RAW) }
    }
    else
    {
        let d = INIT_TIME.elapsed();
        d.as_millis().try_into().unwrap_or(0)
    }
}
