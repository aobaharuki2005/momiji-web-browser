#pragma once
// IWYU pragma: private, include "rlbox_wasm2c_sandbox.hpp"
#include <stdint.h>

namespace rlbox {

class rlbox_wasm2c_sandbox;

struct rlbox_wasm2c_sandbox_thread_data
{
  rlbox_wasm2c_sandbox* sandbox;
  uint32_t last_callback_invoked;
};

#ifdef RLBOX_EMBEDDER_PROVIDES_TLS_STATIC_VARIABLES

rlbox_wasm2c_sandbox_thread_data* get_rlbox_wasm2c_sandbox_thread_data();
#if defined(XP_DARWIN)
#include <AvailabilityMacros.h>
#endif

#  if !defined(MAC_OS_X_VERSION_10_7) || \
         MAC_OS_X_VERSION_MIN_REQUIRED < MAC_OS_X_VERSION_10_7                          
#   define RLBOX_WASM2C_SANDBOX_STATIC_VARIABLES()                                       \
     static pthread_key_t lckey_wasm2c;                                                  \
     static pthread_once_t lckey_wasm2c_once = PTHREAD_ONCE_INIT;                        \
     static void make_key(void) {                                                        \
         pthread_key_create(&lckey_wasm2c, NULL);                                        \
     }                                                                                   \
     namespace rlbox {                                                                   \
       rlbox_wasm2c_sandbox_thread_data *get_rlbox_wasm2c_sandbox_thread_data(void) {    \
         pthread_once(&lckey_wasm2c_once, make_key);                                     \
         rlbox_wasm2c_sandbox_thread_data *config = (rlbox_wasm2c_sandbox_thread_data*)  \
                                                     pthread_getspecific(lckey_wasm2c);  \
         if (!config) {                                                                  \
           config = new rlbox_wasm2c_sandbox_thread_data();                              \
           pthread_setspecific(lckey_wasm2c, config);                                    \
         }                                                                               \
         return config;                                                                  \
       }                                                                                 \
     }
#  else
#    define RLBOX_WASM2C_SANDBOX_STATIC_VARIABLES()                                     \
      thread_local rlbox::rlbox_wasm2c_sandbox_thread_data                              \
      rlbox_wasm2c_sandbox_thread_info{ 0, 0 };                                         \
                                                                                        \
        namespace rlbox {                                                               \
          rlbox_wasm2c_sandbox_thread_data* get_rlbox_wasm2c_sandbox_thread_data()      \
          {                                                                             \
            return &rlbox_wasm2c_sandbox_thread_info;                                   \
          }                                                                             \
        }                                                                               \
        static_assert(true, "Enforce semi-colon")
#  endif
#endif

} // namespace rlbox
