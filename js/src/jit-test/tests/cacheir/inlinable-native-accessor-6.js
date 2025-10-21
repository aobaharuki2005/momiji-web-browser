setJitCompilerOption("ion.forceinlineCaches", 1);

function testMathRandom() {
  var obj = Object.defineProperty({}, "random", {get: Math.random});

  for (var i = 0; i < 100; ++i) {
    var r = obj.random;
    assertEq(0 <= r && r < 1, true);
  }
}
testMathRandom();

function testDateGetTime() {
  Object.defineProperty(Date.prototype, "time", {get: Date.prototype.getTime});

  var d = new Date(0);
  for (var i = 0; i < 100; ++i) {
    assertEq(d.time, 0);
  }
}
testDateGetTime();
