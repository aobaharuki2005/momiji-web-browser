/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "find_firefox.h"

#include <iostream>
#include <optional>
#include <string>
#include <windows.h>

/**
 * Look up Firefox path in a particular HKEY
 */
static std::optional<std::wstring> lookupFirefoxPathInHKEY(HKEY hkey) {
  std::wstring firefox_node = L"SOFTWARE\\Mozilla\\Mozilla Firefox";
  std::wstring current_version = L"CurrentVersion";
  wchar_t buffer[MAX_PATH];
  // RegGetValueW will store the size of the value (including terminal \0) in
  // bytes into this variable.
  DWORD value_size = sizeof buffer;

  // First we need to get the current version of Firefox
  LSTATUS status =
      RegGetValueW(hkey, firefox_node.c_str(), current_version.c_str(),
                   RRF_RT_REG_SZ, nullptr, buffer, &value_size);
  if (status != ERROR_SUCCESS) {
    std::wcout << "Failed to get firefox current version " << status
               << std::endl;
    return std::nullopt;
  }
  // Then we need to see where that version is installed
  std::wstring current_version_string =
      std::wstring(buffer, value_size / sizeof(wchar_t) - 1);
  std::wstring current_version_node =
      firefox_node + L"\\" + current_version_string + L"\\Main";
  std::wstring path_to_exe = L"PathToExe";
  value_size = sizeof buffer;
  status = RegGetValueW(hkey, current_version_node.c_str(), path_to_exe.c_str(),
                        RRF_RT_REG_SZ, nullptr, buffer, &value_size);
  if (status != ERROR_SUCCESS) {
    std::wcout << "Failed to get firefox path for current version, at location "
               << current_version_node << " status was " << status << std::endl;
    return std::nullopt;
  }
  // We should have the path in buffer. Note that value_len contains the size of
  // the path in bytes, so we need to divide by 2 to get the length in
  // characters.
  std::wstring firefox_path = std::wstring(buffer, value_size / 2 - 1);
  return firefox_path;
}

/**
 * Look up Firefox path in registry keys
 * @return  the path as a std::wstring if found
 */
std::optional<std::wstring> lookupFirefoxPath() {
  auto sharedInstallPath = lookupFirefoxPathInHKEY(HKEY_LOCAL_MACHINE);
  if (sharedInstallPath.has_value()) {
    return sharedInstallPath;
  } else {
    return lookupFirefoxPathInHKEY(HKEY_CURRENT_USER);
  }
}
