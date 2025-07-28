/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "gtest/gtest.h"
#include <windows.h>
#include <string>
#include <optional>
#include "find_firefox.h"
#include "tempfile_name.h"
#include "download_firefox.h"
#include "data_sink.h"

class StringDataSink : public DataSink {
 public:
  std::string data;

  bool accept(char* buf, int count) {
    std::string str(buf, count);
    data += str;
    return true;
  }
};

class DesktopLauncherTest : public ::testing::Test {
 protected:
  void SetUp() override {}

  void TearDown() override {}
};

TEST_F(DesktopLauncherTest, FirefoxPathTest) {
  std::optional<std::wstring> path = lookupFirefoxPath();
  if (path.has_value()) {
    // If there is a Firefox path found, it should contain firefox.exe
    ASSERT_TRUE(path.value().find(std::wstring(L"firefox.exe")) >= 0);
  }
}

TEST_F(DesktopLauncherTest, TempFileNameTest) {
  std::optional<std::wstring> path = get_tempfile_name();
  ASSERT_TRUE(path.has_value());
  ASSERT_TRUE(path.value().find(std::wstring(L".exe")) > 0);
  ASSERT_TRUE(path.value().find(std::wstring(L":\\")) > 0);
}

TEST_F(DesktopLauncherTest, TestGetObjectName) {
  std::optional<std::wstring> objectName = get_object_name();
  ASSERT_TRUE(objectName.has_value());
  ASSERT_EQ(objectName.value().find(L"/?product=firefox-stub&os=win&lang="), 0);
}
