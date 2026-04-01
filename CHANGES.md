# Modifications made to Mozilla Firefox

This document enlists all modifications made to Firefox-Dynasty and Rust source code which enables **reproducible and macOS 10.7-compatible compilation** of Firefox-Dynasty binaries. 

Be cautious that these changes does not mean to **direcly enable upstream Firefox to run on macOS 10.7-10.14**. All changes which really enables Firefox to work on macOS 10.7-10.14 still remain mysterious (due to lack of documentation from i3roly), thus all those credits also goes to i3roly, not me.

## I. Which sources did I choose to work on in the first place?
- Firefox-Dynasty 140.0.4 tag released by i3roly: [https://github.com/Wowfunhappy/firefox-dynasty/tree/FIREFOX_140_0_4_RELEASE](https://github.com/Wowfunhappy/firefox-dynasty/tree/FIREFOX_140_0_4_RELEASE)
- Rust toolchain version 1.91.0: [https://github.com/aobaharuki2005/rust/tree/1.91.0-custom](https://github.com/aobaharuki2005/rust/tree/1.91.0-custom)

## II. Firefox source modification for successful build (least aggressive)

These modifications are categorized as 'least aggressive' because they're actually cofiguration tweaks only, without any changes to the core logics.

### Patch #1: Add fake def of __sincospi and __sincospif function 

**Files modified:**: `widget/cocoa/TextRecognition.mm`

**Changes:**
- Add fake definition of `__sincospif` and `__sincospi` function
- Reason: These math functions are simple by sight; however, they are actually optimized functions available only on macOS 10.9 earlier. If you try to build a 10.7-compatible version with `MACOSX_DEPLOYMENT_TARGET=10.7` and flag `-mmacosx_version_min=10.7`, Clang will throw an "declaration not found" error. These "stub definition" are appended to alleviate such problems without minimum breaking changes. 

**Full commit:**
[Fix: Add fake def of __sincospi and __sincospif function](https://github.com/aobaharuki2005/momiji-web-browser/commit/804297a49ac2de0180125b82e63bc5780a940903)

**License:** MPL 2.0 (Firefox source)

## III. Firefox build configuration adjustment for successful build (fairly aggressive)

'Fairly aggressive' means that these patches have been more aggressive in enforcing the core logics so that we can get the expected outcomes and behaviors.

### Patch #2: force the use of `ld64` linker instead off `lld`

**Files Modified:**: `build/moz.configure/toolchain.configure`

**Changes:**
- Patch the `try_linker(linker)` function so that it will always choose `ld64` linker of Apple Xcode (actual linker executable is `ld` but linker type is `ld64`, don't confuse these), rather than default `lld` linker specified by Mozilla Firefox.
- Reason: `lld` is kinda dumb when dealing with linking symbols from Apple Frameworks for old targets (`MACOSX_DEPLOYMENT_TARGET=10.7`) which can cause "Symbol not found" error during buildtime, while Apple Xcode's `ld64` linker, on the other hand, is much more knowledgeable about such "Frameworks" things. 

Actual experience showed that when the build process was almost done, `lld` linker had thrown an error: `Symbol not found for architecture x86_64, _OBJC_CLASS_$_NSLayoutConstraint` (which was actually locating in `/System/Library/Frameworks/AppKit.framework`)

**Full commit:** [https://github.com/aobaharuki2005/momiji-web-browser/commit/bf02c5131a96b52222ef352d0aa1c72218cfb4fb](https://github.com/aobaharuki2005/momiji-web-browser/commit/bf02c5131a96b52222ef352d0aa1c72218cfb4fb)

**License:** MPL 2.0 (Firefox source)

### Patch #3: clearly incorporate the explicit `os_Darwin_x86_64.s` assembly source to be imported, not the ambiguous `os_Darwin.s` one

**Files Modified:** `config/external/nspr/pr/moz.build`

**Changes:**
- Replace `os_Darwin_x86_64.s` with `os_Darwin.s` in the list of included assembly sources
- Reason: After the deprecation of i686 (32-bit Intel) arch by Apple in macOS 10.15, the `os_Darwin.s` which acts as a macro definition to define which actual assembly source to use based on target architecture has no longer worked and cause `Symbol not found for architecture x86_64: __PRInt64, ...` when compiling against `x86_64-apple-darwin` target.

**Full commit:** [https://github.com/aobaharuki2005/momiji-web-browser/commit/9f71a683a13f3c126703d362c89ca6e108574bba](https://github.com/aobaharuki2005/momiji-web-browser/commit/9f71a683a13f3c126703d362c89ca6e108574bba)

**License:** MPL 2.0 (Firefox source)

*!!! Do notice that above changes just enable successful compilation of Firefox-Dynasty binary, which is not enough to make the outcome binary usable on macOS 10.7 as the minimum target. To make it work on macOS 10.7 as intended, we need to make some more sophisticated tweaks.*

## IV. Firefox build configuration adjustment for successful runtime on macOS 10.7-10.14 (fairly aggressive)

### Patch #4 + #5: Prioritize legacy frameworks instead of modern frameworks

**Files modified:** 
- `dom/media/platforms/moz.build` (AudioUnit over AudioToolbox)
- `media/libcubeb/gtest/moz.build` (AudioUnit over AudioToolbox)
- `toolkit/library/moz.build` (AudioUnit over AudioToolbox, AppKit over Foundation)

**Changes:**
- Prioritize `AudioUnit.framework` over `AudioToolbox.framework`
    - Reason: This patch is to fix the error `Symbol not found: _AudioComponentFindNext, _AudioComponentInstanceDispose, _AudioComponentInstanceNew, expected in AudioToolbox.framework`, due to the fact that in macOS 10.9 and earlier, these symbols has not been moved out of `AudioUnit.framework` yet. By prioritizing `AudioUnit.framework` over `AudioToolBox.framework` in all `OS_LIB` lists where both appears, we ensure that the symbols will be searched first in AudioUnit and then be linked there, which eliminates the missing symbol error on macOS 10.9 and earlier
- Prioritize `AppKit.framework` over `Foundation.framework`
    - Reason: In macOS 10.8 and earlier, the `_OBJC_CLASS_$_NSLayoutConstraint` symbol is expected to be found in `AppKit.framework`. Howwever since macOS 10.9 Apple has moved it into `Foundation.framework` (so that this symbol can be sharingly used both for iOS and macOS). Without this patch, Momiji will still trying to find the symbol staticly in `Foundation.framework` in macOS 10.8 and earlier, and then crash with `Symbol not found` error

**Full commit**:

[https://github.com/aobaharuki2005/momiji-web-browser/commit/a28a27506b2e24498191ad28ab0b2738de9bc875](https://github.com/aobaharuki2005/momiji-web-browser/commit/a28a27506b2e24498191ad28ab0b2738de9bc875)

[https://github.com/aobaharuki2005/momiji-web-browser/commit/12a92c032aabaee84c5bf4b0a8b63ab221d2d79a](https://github.com/aobaharuki2005/momiji-web-browser/commit/12a92c032aabaee84c5bf4b0a8b63ab221d2d79a)

**License:** MPL 2.0 (Firefox source)

## V. Rust toolchain (most aggressive)

These patches are categorized as 'most aggressive' due to the following reasons:
1. You have to replace the existing symbols with the fallback ones which are available and works on legacy targets (macOS 10.7-10.9). This requires heavy knowledges about macOS SDK and APIs.
2. It's not simply building Firefox-Dynasty anymore; each patch enlisted down there means **you will have to rebuild the whole Rust toolchain** to make it work. Because Firefox is a combination of Rust and C/C++/Objective-C components (with Rust accounts for about 50-60%), without a compatible Rust toolchain, your built Firefox-Dynasty will still remain futile on such legacy macOS versions.

### Patch #6 + #7 + #8: Rust Standard Library (rust-std) 

**Files modified:**
- `library/std/src/sys/pal/unix/time.rs`
- `library/std/src/sys/random/apple.rs`
- `library/std/src/sys/fs/unix.rs`

**Changes:**
- Replaced `clock_gettime` with `mach_absolute_time` fallback
- Replaced `CCRandomGenerateBytes` with `arc4random_buf` fallback
- Add `target_os = "macos"` to the `_dirfd` symbol's exclusion list
- Reason: Symbols `clock_gettime`, `CCRandomGenerateBytes` are unavailable on macOS 10.7-10.11. `_dirfd` is a modern POSIX symbol which did not exist until the debut of macOS 10.9. Without these patches, Firefox-Dynasty will crash and emit the `symbol not found: ..., expected in /usr/lib/libSystem.B.dylib` on these platforms as they had never been existed there `(libSystem.B.dylib)` before macOS 10.12.

**Full commits:** (in my Rust fork)

[https://github.com/aobaharuki2005/rust/commit/8fd130fd595d53e6e67518ffc4ec5fa3f9a11e3e](https://github.com/aobaharuki2005/rust/commit/8fd130fd595d53e6e67518ffc4ec5fa3f9a11e3e)

[https://github.com/aobaharuki2005/rust/commit/b8e8a55ff1f779cb05b6f5c4ecea4a5d677b8035](https://github.com/aobaharuki2005/rust/commit/b8e8a55ff1f779cb05b6f5c4ecea4a5d677b8035)

[https://github.com/aobaharuki2005/rust/commit/18c63542011094aecca909177e3ebaf5ab291add](https://github.com/aobaharuki2005/rust/commit/18c63542011094aecca909177e3ebaf5ab291add)

**License:** These files remain under Rust's MIT/Apache 2.0 license

### Patch #9: Rust Compiler Target Specification

**Files modified:** `compiler/rustc_target/src/spec/base/apple/mod.rs`

**Changes:**
- Changed `os_minimum_deployment_target` from (10,12,0) to (10,7,0)
- Reason: Force Rust to disable unnecessary modern optimizations and produce truly-clean 10.7-compatible binaries. As you may notice, I have mentioned that building a 10.7-compatible Firefox fork requires both `MACOSX_DEPLOYMENT_TARGET=10.7` and flag `-mmacosx_version_min=10.7`; however these environment variables and flags are only partially effective with Rust. Without changing its hardcoded condition, Rust will still emit modenrized, optimized math functions like `_sincosf_strat` and `_exp10`, which result in `symbol not found in XUL: _sincosf_strat and _exp10 from libSystem.dylib` in macOS 10.8 and 10.7. 

**Full commits:** [https://github.com/aobaharuki2005/rust/commit/8e7244bdc54a37f0d55073591cab02f3d92bb625](https://github.com/aobaharuki2005/rust/commit/8e7244bdc54a37f0d55073591cab02f3d92bb625)

**License:** These files remain under Rust's MIT/Apache 2.0 license