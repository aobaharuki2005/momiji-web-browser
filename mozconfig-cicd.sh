#!/bin/sh
# ======== BUILD DESTINATION =============
mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/obj-ff-dbg

# ======== TARGET APPLICATION ============
ac_add_options --enable-application=browser

# ======== TARGET PLATFORM ===============
ac_add_options --target=x86_64-apple-darwin
export MACOSX_DEPLOYMENT_TARGET=10.7

# ============= SCCACHE ==============
ac_add_options --with-ccache="$HOME/.mozbuild/sccache/sccache"
export SCCACHE_IDLE_TIMEOUT=0

# ============= NASM & DUMPSYMS =============
export NASM="$HOME/.mozbuild/nasm/nasm"
export DUMP_SYMS="$HOME/.mozbuild/dump_syms/dump_syms"

# ============ SDK ===================
# Use SDK 26.2 (same as which used to build custom Rust) to avoid unexpected conflicts
ac_add_options --with-macos-sdk="/Applications/Xcode_26.2.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX26.2.sdk"

# ============= LINKER ===============
ac_add_options --enable-linker=ld64 # stable option

# ============= DEBUG FLAGS ================
export MOZ_DEBUG_FLAGS="-fdebug-default-version=2 -gdwarf-2 -gfull"

# ============= NODEJS =================
export NODEJS="$HOME/.mozbuild/node/bin/node"

# ===== BRANDING =======
ac_add_options --with-branding=browser/branding/momiji

# ========== RUST ==========
export RUST_BIN_PATH="$HOME/.rustup/toolchains/1.91.0-custom-cross/bin"
export RUSTC="$RUST_BIN_PATH/rustc"
export CARGO="$RUST_BIN_PATH/cargo"
export CBINDGEN="$HOME/.mozbuild/cbindgen/cbindgen"
export RUSTFLAGS="-C link-arg=-mmacosx-version-min=10.7"

# ========== C/C++ ==========
export CC="/usr/bin/clang"
export CXX="/usr/bin/clang++"
export LDFLAGS="-mmacosx-version-min=10.7"
export CFLAGS="-mmacosx-version-min=10.7 -D__MAC_OS_X_VERSION_MIN_REQUIRED=1070"
export CXXFLAGS="-mmacosx-version-min=10.7 -D__MAC_OS_X_VERSION_MIN_REQUIRED=1070"

# ========== OPTIMIZATIONS ==========
ac_add_options --disable-crashreporter
ac_add_options --without-wasm-sandboxed-libraries
ac_add_options --disable-tests
ac_add_options --disable-debug
ac_add_options --disable-dmd
ac_add_options --disable-geckodriver
ac_add_options --disable-profiling
ac_add_options --disable-zucchini   # Only in Momiji rolling (Firefox stable) release

# From Waterfox (Production build)
# ac_add_options --enable-lto=thin
# ac_add_options --enable-optimize="-march=core2 -mtune=ivybridge -O3 -w"
# ac_add_options --enable-release
# ac_add_options --enable-rust-simd
# ac_add_options RUSTC_OPT_LEVEL=3
# export RUSTFLAGS="$RUSTFLAGS -Ctarget-cpu=core2"

# From Waterfox (development build)
ac_add_options --enable-optimize="-Os -w"
