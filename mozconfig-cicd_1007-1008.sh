#!/bin/sh
# ======== BUILD DESTINATION =============
mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/obj-ff-dbg-esr

# ======== TARGET APPLICATION ============
ac_add_options --enable-application=browser

# ======== TARGET PLATFORM ===============
ac_add_options --target=x86_64-apple-darwin
export MACOSX_DEPLOYMENT_TARGET=10.7

# ============= SCCACHE ============== (comment out for production build)
# ac_add_options --with-ccache="$HOME/.mozbuild/sccache/sccache"
# export SCCACHE_IDLE_TIMEOUT=0

# ============= NASM & DUMPSYMS =============
export NASM="$HOME/.mozbuild/nasm/nasm"
export DUMP_SYMS="$HOME/.mozbuild/dump_syms/dump_syms"

# ============ SDK ===================
# Use SDK 15.4 (according to the minimum version specified in python\mozboot\mozboot\util.py
ac_add_options --with-macos-sdk="/Applications/Xcode_16.3.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX15.4.sdk"

# ============= LINKER ===============
ac_add_options --enable-linker=ld64 # for macOS 10.7-10.8

# ============= DEBUG FLAGS ================
export MOZ_DEBUG_FLAGS="-fdebug-default-version=2 -gdwarf-2 -gfull"

# ============= NODEJS =================
export NODEJS="$HOME/.mozbuild/node/bin/node"

# ===== BRANDING =======
ac_add_options --with-app-name=momiji
ac_add_options --with-branding=browser/branding/momiji
ac_add_options --with-distribution-id=net.momiji

# ========== RUST ==========
export RUST_BIN_PATH="$HOME/.rustup/toolchains/nightly-2025-01-09-x86_64-apple-darwin/bin"
export RUSTC="$RUST_BIN_PATH/rustc"
export CARGO="$RUST_BIN_PATH/cargo"
export CBINDGEN="$HOME/.mozbuild/cbindgen/cbindgen"
export RUSTFLAGS="-C link-arg=-mmacosx-version-min=10.7"

# ========== C/C++ ==========
export CC="$HOME/.mozbuild/clang/bin/clang"
export CXX="$HOME/.mozbuild/clang/bin/clang++"
export LDFLAGS="-mmacosx-version-min=10.7 -headerpad_max_install_names"
export CFLAGS="-mmacosx-version-min=10.7 -D__MAC_OS_X_VERSION_MIN_REQUIRED=1070 -Wl,-headerpad_max_install_names"
export CXXFLAGS="-mmacosx-version-min=10.7 -D__MAC_OS_X_VERSION_MIN_REQUIRED=1070 -Wl,-headerpad_max_install_names"

# ========== OPTIMIZATIONS ==========
ac_add_options --disable-crashreporter
# ac_add_options --without-wasm-sandboxed-libraries
ac_add_options --disable-tests
ac_add_options --disable-debug
ac_add_options --disable-dmd
ac_add_options --disable-geckodriver
ac_add_options --disable-profiling
ac_add_options --disable-updater

# From Waterfox (Production build)
# export MOZ_LTO="thin"
# ac_add_options --enable-optimize="-march=core2 -O3 -w"
# ac_add_options --enable-release
# ac_add_options --enable-rust-simd
# ac_add_options RUSTC_OPT_LEVEL=3
# export RUSTFLAGS="$RUSTFLAGS -Ctarget-cpu=core2"

# From Waterfox (development build)
ac_add_options --enable-optimize="-Os -w"
