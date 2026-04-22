#!/bin/sh
# ======== BUILD DESTINATION =============      VERIFIED! 2026-04-20
mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/obj-ff-dbg-esr

# ======== TARGET APPLICATION ============      VERIFIED! 2026-04-20
ac_add_options --enable-application=browser

# ======== TARGET PLATFORM ===============      VERIFIED! 2026-04-20
ac_add_options --target=x86_64-apple-darwin
export MACOSX_DEPLOYMENT_TARGET=10.9

# ============= SCCACHE ==============  VERIFIED! 2026-04-20
ac_add_options --with-ccache="$HOME/.mozbuild/sccache/sccache"
export SCCACHE_IDLE_TIMEOUT=0

# ============= NASM & DUMPSYMS =============       VERIFIED! 2026-04-20
export NASM="$HOME/.mozbuild/nasm/nasm"
export DUMP_SYMS="$HOME/.mozbuild/dump_syms/dump_syms"

# ============ SDK ===================      VERIFIED! 2026-04-20
# Use SDK 15.4 (according to the minimum version specified in python\mozboot\mozboot\util.py
ac_add_options --with-macos-sdk="/Applications/Xcode_16.3.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX15.4.sdk"

# ============= LINKER ===============      VERIFIED! 2026-04-20
ac_add_options --enable-linker=lld # for macOS 10.9+

# ============= SPECIAL DEBUG FLAGS FOR COMPATIBILITY REASON ================ VERIFIED! 2026-04-20
export MOZ_DEBUG_FLAGS="-fdebug-default-version=2 -gdwarf-2 -gfull"

# ============= NODEJS =================    VERIFIED! 2026-04-20
export NODEJS="$HOME/.mozbuild/node/bin/node"

# ===== BRANDING =======
ac_add_options --with-app-name=momiji
ac_add_options --with-branding=browser/branding/momiji
# ac_add_options --with-distribution-id=net.momiji  # Disable in favor of compatibility with Firefox-Dynasty/older Momiji created profiles

# ========== RUST ==========
export RUST_BIN_PATH="$HOME/.rustup/toolchains/nightly-2025-01-09-x86_64-apple-darwin/bin"  # Rust 1.86.0-nightly
export RUSTC="$RUST_BIN_PATH/rustc"
export CARGO="$RUST_BIN_PATH/cargo"
export CBINDGEN="$HOME/.mozbuild/cbindgen/cbindgen"

# ========== C/C++ ==========   AMENDED! 2026-04-21
# Use Mozilla Clang for both wasm and main target on 10.9+
export CC="$HOME/.mozbuild/clang/bin/clang"
export CXX="$HOME/.mozbuild/clang/bin/clang++"

# ========== OPTIMIZATIONS ==========   AMENDED! 2026-04-20
# Officially eliminate --without-wasm-sandboxed-libraries flag because it's been decided
#   to enable wasm again for most of WebRTC functions
# Move --disable-debug to production-specific optimizations
ac_add_options --disable-crashreporter
ac_add_options --disable-tests
ac_add_options --disable-dmd
ac_add_options --disable-geckodriver
ac_add_options --disable-profiling
ac_add_options --disable-updater

# ========= Production-specific optimizations (reference from Waterfox) ===========     AMENDED! 2026-04-20
# Remove unnecessary aggressive --enable-release and --enable-rust-simd, which may be unsuitable for very old processors (like MacPro1,1 and MacPro1,2)
# Decrease optimization level of both Clang and Rust to -O2 to ensure compabitibility on very old processors
# Force both C/C++ and Rust codes to be compatible with very old Nocona architectures (MacPro1,1 and MacPro1,2)
# Relocates LDFLAGS to production-specific optimizations, which is sounder

ac_add_options --disable-debug
ac_add_options --enable-lto=thin
ac_add_options --enable-optimize="-march=nocona -O2 -w"
export RUSTC_OPT_LEVEL=2
export RUSTFLAGS="-Ctarget-cpu=nocona"
export LDFLAGS="-march=nocona"

# ========= Testing-specific optimizations (reference from Waterfox) ===========    AMENDED! 2026-04-20
# Just simply --disable-optimize to enable faster build time
# ac_add_options --disable-optimize
# export CFLAGS="-w"
# export CXXFLAGS="-w"