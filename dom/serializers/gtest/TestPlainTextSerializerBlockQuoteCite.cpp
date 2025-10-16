/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Common.h"
#include "gtest/gtest.h"
#include "nsCRT.h"
#include "nsIDocumentEncoder.h"
#include "nsIParserUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsString.h"

TEST(PlainTextSerializerBlockQuoteCite, BlockQuoteCite)
{
  nsAutoString test;
  test.AppendLiteral(u"<blockquote type=cite>hello world</blockquote>");

  const uint32_t wrapColumn = 10;
  ConvertBufToPlainText(test,
                        nsIDocumentEncoder::OutputFormatted |
                            nsIDocumentEncoder::OutputFormatFlowed |
                            nsIDocumentEncoder::OutputCRLineBreak |
                            nsIDocumentEncoder::OutputLFLineBreak,
                        wrapColumn);

  constexpr auto expect = NS_LITERAL_STRING_FROM_CSTRING(
      "> hello \r\n"
      "> world\r\n");

  ASSERT_EQ(test, expect) << "Wrong blockquote cite to text serialization";
}
