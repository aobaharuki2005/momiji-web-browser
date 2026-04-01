# Building Momiji Web Browser

Momiji is a fork of Mozilla Firefox targeting legacy macOS versions (10.7–10.14). This guide covers the full process of setting up a build environment and compiling Momiji from source.

---

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Dependency Overview](#dependency-overview)
3. [Toolchain Setup](#toolchain-setup)
   - [Custom Rust Toolchain](#custom-rust-toolchain)
   - [Mozilla Build Tools (Bootstrapping)](#mozilla-build-tools-bootstrapping)
4. [Mozconfig Configuration](#mozconfig-configuration)
5. [Build Variants](#build-variants)
   - [Production Build](#production-build)
   - [Development Build](#development-build)
6. [Building](#building)
7. [Artifacts and Output](#artifacts-and-output)
8. [Troubleshooting](#troubleshooting)

---

## System Requirements

| Requirement         | Minimum                                   |
|---------------------|-------------------------------------------|
| **Host OS**         | macOS 15 or later (build host)            |
| **Xcode**           | Xcode 26.2 (with macOS 26.2 SDK)          |
| **Architecture**    | x86_64                                    |
| **RAM**             | 16 GB recommended (32 GB for LTO builds)  |
| **Disk space**      | ~40 GB free (source + obj dir + ccache)   |
| **Target OS**       | macOS 10.7 – 10.14 (deployment target)    |

---

## Dependency Overview

The following tools are required before building. Most are managed under `$HOME/.mozbuild/` by Mozilla's bootstrapper, but some must be installed or configured manually.

| Tool         | Source / Location                                    | Notes                                         |
|--------------|------------------------------------------------------|-----------------------------------------------|
| `clang`      | `/usr/bin/clang` (Apple Clang via Xcode)             | C/C++ compiler                                |
| `rustc`      | `$HOME/.rustup/toolchains/1.91.0-custom/bin/rustc`   | **Custom build** — see [Toolchain Setup](#toolchain-setup) |
| `cargo`      | `$HOME/.rustup/toolchains/1.91.0-custom/bin/cargo`   | Must match the custom `rustc`                 |
| `sccache`    | `$HOME/.mozbuild/sccache/sccache`                    | Compiler cache (speeds up rebuilds)           |
| `nasm`       | `$HOME/.mozbuild/nasm/nasm`                          | Assembler for media codecs                    |
| `dump_syms`  | `$HOME/.mozbuild/dump_syms/dump_syms`                | Symbol extraction for crash reporting         |
| `cbindgen`   | `$HOME/.mozbuild/cbindgen/cbindgen`                  | Rust → C header generator                    |
| `node`       | `$HOME/.mozbuild/node/bin/node`                      | Required for the build system                 |

---

## Toolchain Setup

### Custom Rust Toolchain

Momiji requires a custom-built Rust toolchain with the macOS minimum deployment target lowered to **10.7**. The upstream Rust toolchain hardcodes a minimum of `(10, 12, 0)` in `compiler/rustc_target/src/spec/base/apple/mod.rs`, which causes symbol compatibility failures on macOS 10.7–10.9.

The prebuilt custom toolchain is distributed via [my custom Rust releases](https://github.com/aobaharuki2005/rust/releases/tag/v1.91.0-custom-redist). Run the following commands to install it on your machine:

```sh
# Download the release tarball
curl -LO https://github.com/aobaharuki2005/rust/releases/download/v1.91.0-custom-redist/1.91.0-custom.tar.gz

# Extract and register with rustup
mkdir -p "$HOME/.rustup/toolchains/1.91.0-custom"
tar -xzf rust-1.91.0-custom-x86_64-apple-darwin.tar.gz \
    -C "$HOME/.rustup/toolchains/1.91.0-custom" \

# Verify
"$HOME/.rustup/toolchains/1.91.0-custom/bin/rustc" --version
# Expected output: rustc 1.91.0-nightly (8e7244bdc 2026-03-17)
"$HOME/.rustup/toolchains/1.91.0-custom/bin/cargo" --version
# Expected output: cargo 1.91.0-nightly (24bb93c38 2025-09-10)
```

> **Why a custom toolchain?** The hardcoded `(10, 12, 0)` lower bound in upstream Rust causes the linker to emit references to symbols unavailable on 10.7–10.9 (`_sincosf_stret`, `_exp10`, `os_unfair_lock`, etc.). The custom toolchain patches this to `(10, 7, 0)` and rebuilds the full standard library with the correct deployment target.

---

### Mozilla Build Tools (Bootstrapping)

Most remaining tools (`sccache`, `nasm`, `cbindgen`, `node`, `dump_syms`) are managed by Mozilla's `mach bootstrap` command. Run it once from the repository root:

```sh
./mach bootstrap --application-choice browser
```

Remember to enter `N` at any questions asking you to configure Git for optimal use or set up telemetry. They're unnecessary.

This installs tools under `$HOME/.mozbuild/`. The `mozconfig` is pre-configured to reference these standard paths; no additional adjustment is needed unless you override tool locations.

---

## Mozconfig Configuration

Copy the provided `mozconfig-cicd.sh` to the root of the repository as `mozconfig`:

```sh
cp mozconfig-cicd.sh mozconfig
```

Below is a summary of the key configuration decisions in this file:

### Deployment Target

```sh
ac_add_options --target=x86_64-apple-darwin11.0.0
export MACOSX_DEPLOYMENT_TARGET=10.7
```

Sets the binary deployment target to macOS 10.7 (Lion). All C, C++, and Rust flags propagate this target consistently:

```sh
export CFLAGS="-mmacosx-version-min=10.7 -D__MAC_OS_X_VERSION_MIN_REQUIRED=1070"
export CXXFLAGS="-mmacosx-version-min=10.7 -D__MAC_OS_X_VERSION_MIN_REQUIRED=1070"
export LDFLAGS="-mmacosx-version-min=10.7"
export RUSTFLAGS="-C link-arg=-mmacosx-version-min=10.7"
```

### SDK

```sh
ac_add_options --with-macos-sdk="/Applications/Xcode_26.2.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX26.2.sdk"
```

Uses the macOS 26.2 SDK — the same SDK used to build the custom Rust toolchain — to avoid unexpected ABI conflicts between the toolchain's libstd and the Firefox C++ layer. Notice the `/Applications/Xcode_26.2.app` - if your Xcode 26 **locates in a different path** - do adjust it correctly.

### Branding

```sh
ac_add_options --with-app-name=momiji
ac_add_options --with-branding=browser/branding/momiji
ac_add_options --with-distribution-id=net.momiji
```

Ensures the output binary and `.app` bundle are branded as Momiji rather than Firefox.

### Optional: Compiler Cache (sccache)

```sh
ac_add_options --with-ccache="$HOME/.mozbuild/sccache/sccache"
export SCCACHE_IDLE_TIMEOUT=0
```

`SCCACHE_IDLE_TIMEOUT=0` disables the idle-timeout shutdown of the sccache server, which is especially important in CI environments where the build may pause between compilation units. If you don't plan to develop constantly which require incremental cache for faster build time, consider commenting it out.

### Linker

```sh
ac_add_options --enable-linker=ld64
```

Uses the system `ld64` linker. This is the stable choice for macOS targets; `lld` can be faster but has known incompatibilities with certain macOS frameworks on older targets.

---

## Build Variants

### Production Build

The default `mozconfig` is configured for a production build with LTO and high optimization:

```sh
export MOZ_LTO="thin"
ac_add_options --enable-optimize="-march=core2 -O3 -w"
ac_add_options --enable-release
ac_add_options --enable-rust-simd
ac_add_options RUSTC_OPT_LEVEL=3
export RUSTFLAGS="$RUSTFLAGS -Ctarget-cpu=core2"
```

- **`-march=core2`** / **`-Ctarget-cpu=core2`**: Targets Intel Core 2 micro-architecture, ensuring compatibility with all Intel Macs in the 10.7+ era while enabling SSE4 and other relevant SIMD extensions.
- **Thin LTO**: Reduces binary size and improves runtime performance at the cost of longer link times.
- **`RUSTC_OPT_LEVEL=3`**: Maximum Rust optimization level.

> NOTE: Production builds are slow (~1–2 hours on a 12-core machine without a warm sccache). Ensure sccache is primed before running in CI.

### Development Build

To build faster for iteration and debugging, comment out the production block and uncomment the development section in `.mozconfig`:

```sh
# Production (comment out):
# export MOZ_LTO="thin"
# ac_add_options --enable-optimize="-march=core2 -O3 -w"
# ...

# Development (uncomment):
ac_add_options --enable-optimize="-Os -w"
```

You may also want to re-enable debug symbols for development:

```sh
# Already set in mozconfig:
export MOZ_DEBUG_FLAGS="-fdebug-default-version=2 -gdwarf-2 -gfull"

# Add these for full debug build:
# ac_add_options --enable-debug
# ac_add_options --disable-optimize
```

At this point, you can also consider experimenting with your own extra configuration options - run `./mach configure -- --help` for a full list of available options.

---

## Building

Once `.mozconfig` is in place and all dependencies are installed:

```sh
# 1.. Configure (runs configure scripts, resolves options)
./mach configure

# 2. Build
./mach build

# 3. Package into a .app / .dmg
./mach package
```

The built `.dmg` will appear at:

```
obj-ff-dbg-esr/dist/momiji-<version>.en-US.mac.dmg
```

---

## Artifacts and Output

| Path                                    | Description                              |
|-----------------------------------------|------------------------------------------|
| `obj-ff-dbg-esr/`                       | Full build object directory              |
| `obj-ff-dbg-esr/dist/momiji.app`        | Unpackaged application bundle            |
| `obj-ff-dbg-esr/dist/*.dmg`             | Distributable disk image                 |
| `obj-ff-dbg-esr/dist/crashreporter-symbols/` | Debug symbols (if enabled)          |

> **Note:** Crash reporter is disabled (`--disable-crashreporter`) in this configuration, so no Breakpad symbols will be generated.

---

## Troubleshooting

### `_sincosf_stret` / `_exp10` / `os_unfair_lock` linker errors

These symbols are unavailable on macOS 10.7–10.9. They indicate the wrong Rust toolchain is being used or the custom toolchain was not built with the corrected deployment target floor. Verify:

```sh
"$HOME/.rustup/toolchains/1.91.0-custom/bin/rustc" --print cfg | grep target_os
```

Confirm that your custom Rust toolchain's source code's `compiler/rustc_target/src/spec/base/apple/mod.rs` sets the lower bound to `(10, 7, 0)`.

---

### sccache not found / server not running

```sh
# Start sccache manually
"$HOME/.mozbuild/sccache/sccache" --start-server
"$HOME/.mozbuild/sccache/sccache" --show-stats
```

If it exits immediately, check that `SCCACHE_IDLE_TIMEOUT=0` is exported in the environment before starting the build.

---

### SDK path not found

Verify that Xcode 26.2 is installed and the SDK exists:

```sh
ls /Applications/Xcode_26.2.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/
```

If you are using a different Xcode version, update the `--with-macos-sdk` path in `.mozconfig` accordingly, and ensure it matches the SDK used to build the custom Rust toolchain.

---

### `LC_BUILD_VERSION` conflicts

If you see warnings or errors about mismatched `LC_BUILD_VERSION` load commands (common when mixing Apple Clang and custom-built objects), ensure all components — Rust stdlib, Firefox C++ objects, and linked frameworks — were compiled with a consistent `MACOSX_DEPLOYMENT_TARGET=10.7`. The `CFLAGS`, `CXXFLAGS`, `LDFLAGS`, and `RUSTFLAGS` in the provided mozconfig enforce this uniformly.

---

### Relative method lists / Objective-C runtime errors

If you encounter Objective-C selector dispatch failures on older macOS at runtime, this is likely caused by relative method lists emitted by a newer compiler being loaded on a runtime that does not support them. Ensure you are using **Apple Clang** (`/usr/bin/clang`) rather than a Mozilla-distributed LLVM Clang, as Apple Clang correctly gates relative method list emission behind `LC_BUILD_VERSION` checks for the target OS.

---

*For CI/CD pipeline details, see [.github/workflows/](/.github/workflows/).*