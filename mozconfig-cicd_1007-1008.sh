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

# ============ SDK ===================     
ac_add_options --with-macos-sdk="$(xcrun --sdk macosx26.5 --show-sdk-path)"

# ============= LINKER ===============
ac_add_options --enable-linker=ld64

# ============= SPECIAL DEBUG FLAGS FOR COMPATIBILITY REASON ================
export MOZ_DEBUG_FLAGS="-fdebug-default-version=2 -gdwarf-2 -gfull"

# ============= NODEJS =================        
export NODEJS="$HOME/.mozbuild/node/bin/node"

# ===== BRANDING =======       
# ac_add_options --with-app-name=momiji
ac_add_options --with-branding=browser/branding/unofficial

# ========== RUST ==========    
export RUST_BIN_PATH="$HOME/.rustup/toolchains/nightly-2025-08-07-aarch64-apple-darwin/bin"
export RUSTC="$RUST_BIN_PATH/rustc"
export CARGO="$RUST_BIN_PATH/cargo"
export CBINDGEN="$HOME/.mozbuild/cbindgen/cbindgen"

# ========== C/C++ ==========   
export CC="$HOME/.mozbuild/clang/bin/clang"
export CXX="$HOME/.mozbuild/clang/bin/clang++"

# ===== CUSTOM COMPILER FLAGS =======
export CFLAGS="-march=penryn"
export CXXFLAGS=$CFLAGS
export RUSTFLAGS="-C target-cpu=penryn -C link-arg=-ld_classic"
export LDFLAGS="-headerpad_max_install_names -ld_classic"

# ========== OPTIMIZATIONS ==========   
ac_add_options --disable-crashreporter
ac_add_options --disable-tests
ac_add_options --disable-dmd
ac_add_options --disable-geckodriver
ac_add_options --disable-profiling
ac_add_options --disable-updater
ac_add_options --disable-sandbox # On 10.7, sandbox causes some video-streaming services is broken.

# ===== CUSTOMIZATION ==== #
export MOZ_REQUIRE_SIGNING=     # Disable extension signing check

# ========= Production-specific optimizations (reference from Waterfox) ===========     
ac_add_options --enable-strip
ac_add_options --disable-debug
ac_add_options --enable-optimize="-Os -w"
export RUSTC_OPT_LEVEL="s"


# ========= Testing-specific optimizations (reference from Waterfox) ===========
# ac_add_options --disable-optimize
# export CFLAGS="$CFLAGS -w"
# export CXXFLAGS="$CXXFLAGS -w"
