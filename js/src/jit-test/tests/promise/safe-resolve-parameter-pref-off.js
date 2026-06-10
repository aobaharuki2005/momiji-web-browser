// Without the pref, resolve(thenable, true) must behave exactly like
// resolve(thenable) — the second argument is ignored, and Get("then") runs
// on the caller's stack.

// resolve.length is 1 in the pref-off (default) configuration.
{
  const {resolve} = Promise.withResolvers();
  assertEq(resolve.length, 1,
           "without the pref, resolve.length should be 1 (current spec)");
}

// resolve(thenable, true) with the pref off reads 'then' synchronously.
{
  let getterCalls = 0;
  const thenable = {
    get then() {
      getterCalls++;
      return undefined;
    },
  };
  const {promise, resolve} = Promise.withResolvers();
  resolve(thenable, true);
  assertEq(getterCalls, 1,
           "without the pref, the second arg is ignored and 'then' is read sync");
  drainJobQueue();
}

// The proxy trap also fires synchronously.
{
  const trapCalls = [];
  const thenable = new Proxy({}, {
    get(_t, name) {
      trapCalls.push(String(name));
      return undefined;
    },
  });
  const {promise, resolve} = Promise.withResolvers();
  resolve(thenable, true);
  assertEq(trapCalls.length, 1,
           "without the pref, proxy 'get' trap for 'then' fires synchronously");
  assertEq(trapCalls[0], "then");
  drainJobQueue();
}
