// |jit-test| --ion-limit-script-size=off

// Test scalar replacement of TypedArray.prototype.subarray objects.
//
// - Uses various elements sizes (Int8, Int32, Int64) to ensure access is scaled
//   by element size when necessary.
// - Uses different offsets to make sure offset adjustments work correctly.

function assertEqArray(actual, expected) {
  assertEq(actual.length, expected.length);

  for (var i = 0; i < expected.length; ++i) {
    if (!Object.is(actual[i], expected[i])) {
      assertEq(actual[i], expected[i], `[${actual}] != [${expected}] at index ${i}`);
    }
  }
}

// Test |length| and |byteLength| of scalar replaced |subarray| works.
function testLengthAndByteLength() {
  var i8 = new Int8Array(10);
  var i32 = new Int32Array(10);
  var i64 = new BigInt64Array(10);

  for (var i = 0; i < 100; ++i) {
    var sub_i8 = i8.subarray();
    assertEq(sub_i8.length, 10);
    assertEq(sub_i8.byteLength, 10 * Int8Array.BYTES_PER_ELEMENT);
    assertRecoveredOnBailout(sub_i8, true);

    var sub_i32 = i32.subarray(5);
    assertEq(sub_i32.length, 5);
    assertEq(sub_i32.byteLength, 5 * Int32Array.BYTES_PER_ELEMENT);
    assertRecoveredOnBailout(sub_i32, true);

    var sub_i64 = i64.subarray(3, -1);
    assertEq(sub_i64.length, 6);
    assertEq(sub_i64.byteLength, 6 * BigInt64Array.BYTES_PER_ELEMENT);
    assertRecoveredOnBailout(sub_i64, true);
  }
}
testLengthAndByteLength();

// Test |byteOffset| of scalar replaced |subarray| works.
function testByteOffset() {
  var i8 = new Int8Array(new ArrayBuffer(20 * Int8Array.BYTES_PER_ELEMENT), 4, 10);
  var i32 = new Int32Array(new ArrayBuffer(20 * Int32Array.BYTES_PER_ELEMENT), 8, 10);
  var i64 = new BigInt64Array(new ArrayBuffer(20 * BigInt64Array.BYTES_PER_ELEMENT), 16, 10);

  for (var i = 0; i < 100; ++i) {
    var sub_i8 = i8.subarray();
    assertEq(sub_i8.byteOffset, 4);
    assertRecoveredOnBailout(sub_i8, true);

    var sub_i32 = i32.subarray(5);
    assertEq(sub_i32.byteOffset, 8 + 5 * Int32Array.BYTES_PER_ELEMENT);
    assertRecoveredOnBailout(sub_i32, true);

    var sub_i64 = i64.subarray(3, -1);
    assertEq(sub_i64.byteOffset, 16 + 3 * BigInt64Array.BYTES_PER_ELEMENT);
    assertRecoveredOnBailout(sub_i64, true);
  }
}
testByteOffset();

// Test get-element access of scalar replaced |subarray| works.
function testGetElement() {
  var i8 = new Int8Array(10).map((v, k) => k);
  var i32 = new Int32Array(10).map((v, k) => k * 1000);
  var i64 = new BigInt64Array(10).map((v, k) => BigInt(k) * 1_000_000_000_000n);

  for (var i = 0; i < 100; ++i) {
    var sub_i8 = i8.subarray();
    var sum = 0;
    for (var j = 0; j < sub_i8.length; ++j) {
      sum += sub_i8[j];
    }
    assertEq(sum, 0 + 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9);
    assertRecoveredOnBailout(sub_i8, true);

    var sub_i32 = i32.subarray(-6);
    var sum = 0;
    for (var j = 0; j < sub_i32.length; ++j) {
      sum += sub_i32[j];
    }
    assertEq(sum, 4000 + 5000 + 6000 + 7000 + 8000 + 9000);
    assertRecoveredOnBailout(sub_i32, true);

    var sub_i64 = i64.subarray(8, 100);
    var sum = 0n;
    for (var j = 0; j < sub_i64.length; ++j) {
      sum += sub_i64[j];
    }
    assertEq(sum, 8_000_000_000_000n + 9_000_000_000_000n);
    assertRecoveredOnBailout(sub_i64, true);
  }
}
testGetElement();

// Test set-element access of scalar replaced |subarray| works.
function testSetElement() {
  var i8 = new Int8Array(10);
  var i32 = new Int32Array(10);
  var i64 = new BigInt64Array(10);

  for (var i = 0; i < 100; ++i) {
    i8.fill(0);
    i32.fill(0);
    i64.fill(0n);

    var sub_i8 = i8.subarray();
    var sum = 0;
    for (var j = 0; j < sub_i8.length; ++j) {
      sub_i8[j] = j * 10;
    }
    assertRecoveredOnBailout(sub_i8, true);

    var sub_i32 = i32.subarray(-6);
    var sum = 0;
    for (var j = 0; j < sub_i32.length; ++j) {
      sub_i32[j] = j * 1000;
    }
    assertRecoveredOnBailout(sub_i32, true);

    var sub_i64 = i64.subarray(8, 100);
    var sum = 0n;
    for (var j = 0; j < sub_i64.length; ++j) {
      sub_i64[j] = BigInt(j + 1) * 1111n;
    }
    assertRecoveredOnBailout(sub_i64, true);

    assertEqArray(i8, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    assertEqArray(i32, [0, 0, 0, 0, 0, 1000, 2000, 3000, 4000, 5000]);
    assertEqArray(i64, [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 1111n, 2222n]);
  }
}
testSetElement();

