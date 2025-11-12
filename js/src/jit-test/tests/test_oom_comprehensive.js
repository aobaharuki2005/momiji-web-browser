// |jit-test| --setpref=experimental.capture_oom_stack_trace=true; skip-if: !this.hasOwnProperty("getLastOOMStackTrace")

function testStack() {
    function deepFunction() {
        function evenDeeper() {
            throwOutOfMemory();
        }
        return evenDeeper();
    }
    return deepFunction();
}

// Clear any existing trace
var initialTrace = getLastOOMStackTrace();
assertEq(initialTrace, null);

try {
    testStack();
    assertEq(true, false, "Expected an OOM exception");
} catch (e) {
    print("✓ Exception caught: " + e);

    // Check for captured stack trace
    var finalTrace = getLastOOMStackTrace();
    assertEq(finalTrace !== null, true, "Expected a stack trace after OOM");

    print(finalTrace);

    // Detailed analysis
    var lines = finalTrace.split('\n').filter(line => line.trim());
    assertEq(finalTrace.includes("#"), true);
}