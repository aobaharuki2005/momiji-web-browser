# Modifications made to Mozilla Firefox

This document enlists all modifications made to Firefox source code which enables compatibility with macOS 10.7-10.14.

## A. i3roly's patches

*(Documentation in progress)*

## B. My patches (incomplete)

### 1. Rust Standard Library

**Files modified:**
- `library/std/src/sys/pal/unix/time.rs`
- `library/std/src/sys/random/apple.rs`

**Changes:**
- Replaced `clock_gettime()` with `gettimeofday()` fallback
- Replaced `CCRandomGenerateBytes()` with `arc4random_buf()`
- Reason: APIs unavailable on macOS 10.7-10.11

**License:** These files remain under Rust's MIT/Apache 2.0 license

### 2. Rust Compiler Target Specification

**Files modified:**
- `compiler/rustc_target/src/spec/base/apple/mod.rs`
- `compiler/rustc_session/src/session.rs`

**Changes:**
- Changed `os_minimum_deployment_target` from (10,12,0) to (10,7,0)
- Modified deployment target validation logic
- Reason: Enable targeting macOS 10.7

**License:** These files remain under Rust's MIT/Apache 2.0 license

### 3. Firefox Build Configuration
**Files Modified:**
- `toolkit/library/moz.build`

**Changes:**
- Reordered framework linking: AudioUnit before AudioToolbox, ApplicationServices and AppKit before any others
- Reason: Symbol compatibility with macOS 10.7

**License:** MPL 2.0 (Firefox source)

***(to be continued)***