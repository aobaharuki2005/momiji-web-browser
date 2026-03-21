#!/bin/sh
# ======== BUILD DESTINATION =============
mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/obj-ff-dbg-esr

# ======== TARGET APPLICATION ============
ac_add_options --enable-application=browser

# ======== TARGET PLATFORM ===============
ac_add_options --target=x86_64-apple-darwin11.0.0
export MACOSX_DEPLOYMENT_TARGET=10.7

# ============= LINKER ===============
ac_add_options --enable-linker=ld64 # stable option

# ============= DEBUG FLAGS ================
export MOZ_DEBUG_FLAGS="-fdebug-default-version=2 -gdwarf-2 -gfull"

# ============= NODEJS =================
export NODEJS="$HOME/.mozbuild/node/bin/node"

# ===== BRANDING =======
ac_add_options --with-branding=browser/branding/momiji

# ========== RUST ==========
export RUST_BIN_PATH="$HOME/.rustup/toolchains/1.91.0-custom/bin"
export RUSTC="$RUST_BIN_PATH/rustc"
export CARGO="$RUST_BIN_PATH/cargo"
export CBINDGEN="$HOME/.mozbuild/cbindgen/cbindgen"
export RUSTFLAGS="-C link-arg=-mmacosx-version-min=10.7"
export CARGOFLAGS="-C link-arg=-mmacosx-version-min=10.7"

# ========== C/C++ ==========
export CC="$HOME/.mozbuild/clang/bin/clang"
export CXX="$HOME/.mozbuild/clang/bin/clang++"
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

# From Waterfox
ac_add_options --enable-lto=full
ac_add_options --enable-optimize="-march=core2 -mtune=ivybridge -O3 -w"
ac_add_options --enable-release
ac_add_options --enable-rust-simd
ac_add_options RUSTC_OPT_LEVEL=3
export RUSTFLAGS="$RUSTFLAGS -Ctarget-cpu=core2"
