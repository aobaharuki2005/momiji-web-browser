// Copyright (c) 2010 Google Inc.
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
//     * Redistributions of source code must retain the above copyright
// notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above
// copyright notice, this list of conditions and the following disclaimer
// in the documentation and/or other materials provided with the
// distribution.
//     * Neither the name of Google Inc. nor the names of its
// contributors may be used to endorse or promote products derived from
// this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

#include "mac/crash_generation/crash_generation_client.h"

#include "mac/crash_generation/crash_generation_server.h"
#include "common/mac/MachIPC.h"

#include <pthread.h>
#include <servers/bootstrap.h>
#include <os/lock.h>
#include <libkern/OSAtomic.h>

namespace google_breakpad {

bool CrashGenerationClient::RequestDumpForException(
    int exception_type,
    int exception_code,
    int64_t exception_subcode,
    mach_port_t crashing_thread,
    mach_port_t crashing_task) {
  // This ensures that the client is fully initialized, we'll never leave this
  // loop unless sender_ is a valid pointer we can access.
  if (!WaitForInitialization()) {
    return false;
  }

  // The server will send a message to this port indicating that it
  // has finished its work.
  ReceivePort acknowledge_port;

  MachSendMessage message(kDumpRequestMessage);
  message.AddDescriptor(crashing_task);               // crashing task
  message.AddDescriptor(crashing_thread);             // crashing thread
  message.AddDescriptor(MACH_PORT_NULL);              // handler thread
  message.AddDescriptor(acknowledge_port.GetPort());  // message receive port

  ExceptionInfo info;
  info.exception_type = exception_type;
  info.exception_code = exception_code;
  info.exception_subcode = exception_subcode;
  info.child_pid = getpid();

  message.SetData(&info, sizeof(info));

  kern_return_t result = sender_->SendMessage(message, MACH_MSG_TIMEOUT_NONE);
  if (result != KERN_SUCCESS)
    return false;

  // Give the server slightly longer to reply since it has to
  // inspect this task and write the minidump.
  MachReceiveMessage acknowledge_message;
  result = acknowledge_port.WaitForMessage(&acknowledge_message,
                                           MACH_MSG_TIMEOUT_NONE);

  return result == KERN_SUCCESS;
}

// static
void* CrashGenerationClient::AsynchronousInitializationThread(void* arg) {
  CrashGenerationClient* client = reinterpret_cast<CrashGenerationClient*>(arg);
  client->Initialization();
  return nullptr;
}

void CrashGenerationClient::Initialization() {
  assert(state_ == State::Uninitialized);
  mach_port_t task_bootstrap_port = 0;
  kern_return_t rv = task_get_bootstrap_port(mach_task_self(),
                                             &task_bootstrap_port);

  if (rv != KERN_SUCCESS) {
    if (__builtin_available(macOS 10.12, *)) {
      os_unfair_lock_lock(&sync_.mUnfairLock);
    } else {
      OSSpinLockLock(&sync_.mSpinLock);
    }
    state_ = State::Failed;
    if (__builtin_available(macOS 10.12, *)) {
      os_unfair_lock_unlock(&sync_.mUnfairLock);
    } else {
      OSSpinLockUnlock(&sync_.mSpinLock);
    }
    return;
  }

  while (true) {
    mach_port_t send_port;
    rv = bootstrap_look_up(task_bootstrap_port, mach_port_name_.c_str(),
                           &send_port);

    if (rv == KERN_SUCCESS) {
      if (__builtin_available(macOS 10.12, *)) {
        os_unfair_lock_lock(&sync_.mUnfairLock);
      } else {
        OSSpinLockLock(&sync_.mSpinLock);
      }
      state_ = State::Initialized;
      sender_ = std::make_unique<MachPortSender>(send_port);
      if (__builtin_available(macOS 10.12, *)) {
        os_unfair_lock_unlock(&sync_.mUnfairLock);
      } else {
        OSSpinLockUnlock(&sync_.mSpinLock);
      }
      return;
    } else if (rv == BOOTSTRAP_UNKNOWN_SERVICE) {
      struct timespec delay = {
        .tv_sec = 0,
        .tv_nsec = 10 * 1000 * 1000, // 10ms
      };

      nanosleep(&delay, nullptr);
    } else {
      if (__builtin_available(macOS 10.12, *)) {
        os_unfair_lock_lock(&sync_.mUnfairLock);
      } else {
        OSSpinLockLock(&sync_.mSpinLock);
      }
      state_ = State::Failed;
      if (__builtin_available(macOS 10.12, *)) {
        os_unfair_lock_unlock(&sync_.mUnfairLock);
      } else {
        OSSpinLockUnlock(&sync_.mSpinLock);
      }
      return;
    }
  }
}

void CrashGenerationClient::AsynchronousInitialization() {
  pthread_t thread;
  int rv = pthread_create(&thread, nullptr, AsynchronousInitializationThread, this);

  if (rv < 0) {
    state_ = State::Failed;
  }

  pthread_detach(thread);
}

bool CrashGenerationClient::WaitForInitialization() {
  while (true) {
    if (__builtin_available(macOS 10.12, *)) {
      while (!os_unfair_lock_trylock(&sync_.mUnfairLock)) {
        // We can't wait here as we may be in the exception handler, so spin
        // instead until we get the lock.
      }
    } else {
      while (!OSSpinLockTry(&sync_.mSpinLock)) {
      }
    }

    State state = state_;
    if (__builtin_available(macOS 10.12, *)) {
      os_unfair_lock_unlock(&sync_.mUnfairLock);
    } else {
      OSSpinLockUnlock(&sync_.mSpinLock);
    }

    switch (state) {
      case Initializing:
        continue;
      case Initialized:
        return true;
      default:
        return false;
    }
  }
}

}  // namespace google_breakpad
