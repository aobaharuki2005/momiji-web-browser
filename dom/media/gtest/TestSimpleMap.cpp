/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SimpleMap.h"
#include "gtest/gtest.h"
#include "nsString.h"

namespace mozilla {

TEST(SimpleMapTest, Insert)
{
  SimpleMap<int, nsCString> map;

  // Insert new key-value pair
  ASSERT_TRUE(map.Insert(1, "first"_ns));
  ASSERT_EQ(map.Count(), size_t(1));

  // Try to insert duplicate key - should fail
  ASSERT_FALSE(map.Insert(1, "second"_ns));
  ASSERT_EQ(map.Count(), size_t(1));  // Count should still be 1

  // Verify original value is preserved
  Maybe<nsCString> taken = map.Take(1);
  ASSERT_TRUE(taken.isSome());
  ASSERT_TRUE(taken.ref().EqualsLiteral("first"));
  ASSERT_EQ(map.Count(), size_t(0));

  // Verify key is removed
  Maybe<nsCString> shouldBeNothing = map.Take(1);
  ASSERT_TRUE(shouldBeNothing.isNothing());
}

TEST(SimpleMapTest, Find)
{
  SimpleMap<int, nsCString> map;

  ASSERT_FALSE(map.Contains(1));
  ASSERT_TRUE(map.Insert(1, "one"_ns));
  ASSERT_TRUE(map.Contains(1));

  nsCString value;
  ASSERT_TRUE(map.Find(1, value));
  ASSERT_TRUE(value.EqualsLiteral("one"));
  ASSERT_FALSE(map.Contains(1));  // Find also removes the element.
  ASSERT_FALSE(map.Find(2, value));
}

TEST(SimpleMapTest, Take)
{
  SimpleMap<int, nsCString> map;

  ASSERT_EQ(map.Count(), size_t(0));
  map.Insert(1, "one"_ns);
  ASSERT_EQ(map.Count(), size_t(1));
  map.Insert(2, "two"_ns);
  ASSERT_EQ(map.Count(), size_t(2));

  Maybe<nsCString> taken = map.Take(1);
  ASSERT_TRUE(taken.isSome());
  ASSERT_TRUE(taken.ref().EqualsLiteral("one"));
  ASSERT_FALSE(map.Contains(1));
  ASSERT_TRUE(map.Contains(2));
  ASSERT_EQ(map.Count(), size_t(1));

  Maybe<nsCString> notTaken = map.Take(3);
  ASSERT_TRUE(notTaken.isNothing());
}

TEST(SimpleMapTest, Clear)
{
  SimpleMap<int, nsCString> map;

  ASSERT_EQ(map.Count(), size_t(0));

  map.Insert(1, "one"_ns);
  map.Insert(2, "two"_ns);

  ASSERT_EQ(map.Count(), size_t(2));
  ASSERT_TRUE(map.Contains(1));
  ASSERT_TRUE(map.Contains(2));

  map.Clear();
  ASSERT_FALSE(map.Contains(1));
  ASSERT_FALSE(map.Contains(2));
  ASSERT_EQ(map.Count(), size_t(0));
}

TEST(SimpleMapTest, ForEach)
{
  SimpleMap<int, nsCString> map;

  map.Insert(1, "one"_ns);
  map.Insert(2, "two"_ns);
  map.Insert(3, "three"_ns);
  Maybe<nsCString> taken = map.Take(1);
  ASSERT_TRUE(taken.isSome());
  ASSERT_TRUE(taken.ref().EqualsLiteral("one"));
  ASSERT_EQ(map.Count(), size_t(2));

  nsTArray<int> keys;
  map.ForEach(
      [&](int key, const nsCString& value) { keys.AppendElement(key); });

  // The order of iteration is not guaranteed.
  ASSERT_EQ(keys.Length(), size_t(2));
  ASSERT_TRUE(keys.Contains(2) && keys.Contains(3));
}

}  // namespace mozilla
