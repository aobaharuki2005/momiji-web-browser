setJitCompilerOption("ion.forceinlineCaches", 1);

function testMathRandom() {
  var obj = Object.defineProperty({}, "random", {get: Math.random});

  for (var i = 0; i < 100; ++i) {
    var r = obj.random;
    assertEq(0 <= r && r < 1, true);
  }
}
testMathRandom();
