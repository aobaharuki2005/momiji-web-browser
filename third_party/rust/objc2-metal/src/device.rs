use crate::MTLDevice;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2_foundation::NSArray;

// For whatsys
use std::str::FromStr;
use std::{ffi::CStr, os::raw::c_char, path::Path, ptr};

// For whatsys
#[derive(Debug, PartialOrd, PartialEq)]
enum ParseMacOSKernelVersionError {
    SysCtl,
    Malformed,
    Parsing,
}

// For whatsys
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
const MACOS_KERNEL_MAJOR_VERSION_ELCAPITAN: u32 = 15;

/// Returns all Metal devices in the system.
///
/// On macOS and macCatalyst, this API will not cause the system to switch
/// devices and leaves the decision about which GPU to use up to the
/// application based on whatever criteria it deems appropriate.
///
/// On iOS, tvOS and visionOS, this API returns an array containing the same
/// device that MTLCreateSystemDefaultDevice would have returned, or an empty
/// array if it would have failed.
#[inline]
#[allow(unexpected_cfgs)]
pub extern "C-unwind" fn MTLCopyAllDevices() -> Retained<NSArray<ProtocolObject<dyn MTLDevice>>> {
    // MTLCopyAllDevices is always available on macOS and Mac Catalyst, but
    // only available recently on iOS 18.0 / tvOS 18.0 / visionOS 2.0.
    //
    // Instead, we do the fallback to MTLCreateSystemDefaultDevice on those
    // platforms that they do themselves on newer systems.
    //
    // TODO: Use something like <https://github.com/rust-lang/rfcs/pull/3750>
    // to call the actual API when available.
    #[cfg(any(target_os = "macos", target_env = "macabi"))]
    {
        extern "C-unwind" {
            fn MTLCopyAllDevices() -> *mut NSArray<ProtocolObject<dyn MTLDevice>>;
        }

        let ret = if macos_kernel_major_version() >= Ok(MACOS_KERNEL_MAJOR_VERSION_ELCAPITAN) {
        // SAFETY: Marked NS_RETURNS_RETAINED (and has `Copy` in the name).
            unsafe { Retained::from_raw(MTLCopyAllDevices()) }
        } else {
            None
        };
        ret.expect("function was marked as returning non-null, but actually returned NULL")
    }
    #[cfg(not(any(target_os = "macos", target_env = "macabi")))]
    {
        let device = crate::MTLCreateSystemDefaultDevice();
        let slice: &[_] = if let Some(device) = device.as_deref() {
            &[device]
        } else {
            &[]
        };
        NSArray::from_slice(slice)
    }
}
