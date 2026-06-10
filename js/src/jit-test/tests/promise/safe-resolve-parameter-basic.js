// |jit-test| skip-if: getBuildConfiguration("release_or_beta"); --enable-promise-safe-resolve
//
// Thenable-curtailment proposal: the resolve function created by
// `new Promise((resolve, reject) => ...)` takes an optional second
// `doSafeResolve` parameter. When strictly `true`, and the resolution value
// would synchronously run user code, the user-code-running steps are
// deferred to a microtask while the resolving functions are latched.
//
// When the parameter is absent, `false`, or any non-boolean value, the
// behavior is identical to the current spec.

// Resolve length is 2 when the pref is on.
{
  const {resolve} = Promise.withResolvers();
  assertEq(resolve.length, 2,
           "with pref on, resolve.length should be 2 per the updated spec");
}

// Non-object: doSafeResolve doesn't matter, fulfills with the value.
{
  const {promise, resolve} = Promise.withResolvers();
  resolve(42, true);
  let v;
  promise.then(x => { v = x; });
  drainJobQueue();
  assertEq(v, 42);
}

// Plain object without "then": doSafeResolve=true fulfills sync, no deferral
// (nothing on the proto chain would run user code).
{
  const {promise, resolve} = Promise.withResolvers();
  const obj = Object.create(null);
  resolve(obj, true);
  let v;
  promise.then(x => { v = x; });
  drainJobQueue();
  assertEq(v, obj);
}

// Thenable via accessor: doSafeResolve=true defers Get("then") to a job.
{
  let getterCalls = 0;
  const thenable = {
    get then() {
      getterCalls++;
      return undefined;  // non-callable → outer fulfills with thenable itself
    },
  };
  const {promise, resolve} = Promise.withResolvers();
  resolve(thenable, true);
  // The getter must NOT have fired yet.
  assertEq(getterCalls, 0,
           "resolve(thenable, true) must not read 'then' synchronously");

  let v;
  promise.then(x => { v = x; });
  drainJobQueue();
  assertEq(getterCalls, 1, "getter fires exactly once, in the deferred job");
  assertEq(v, thenable);
}

// Same thenable via accessor: doSafeResolve omitted → current spec → Get is
// synchronous.
{
  let getterCalls = 0;
  const thenable = {
    get then() {
      getterCalls++;
      return undefined;
    },
  };
  const {promise, resolve} = Promise.withResolvers();
  resolve(thenable);
  assertEq(getterCalls, 1,
           "resolve(thenable) without second arg reads 'then' synchronously");
  let v;
  promise.then(x => { v = x; });
  drainJobQueue();
  assertEq(v, thenable);
}

// Explicit doSafeResolve=false behaves like no second arg.
{
  let getterCalls = 0;
  const thenable = {get then() { getterCalls++; return undefined; }};
  const {promise, resolve} = Promise.withResolvers();
  resolve(thenable, false);
  assertEq(getterCalls, 1, "resolve(thenable, false) reads 'then' sync");
  drainJobQueue();
}

// Non-boolean truthy values are NOT treated as `true` — spec says "is *true*".
{
  let getterCalls = 0;
  const thenable = {get then() { getterCalls++; return undefined; }};
  const {promise, resolve} = Promise.withResolvers();
  resolve(thenable, 1);  // truthy but not the boolean `true`
  assertEq(getterCalls, 1,
           "non-boolean truthy second arg does NOT trigger safe resolve");
  drainJobQueue();
}

// Proxy as resolution: safe-resolve defers; no MOP trap fires sync.
{
  const trapCalls = [];
  const thenable = new Proxy({}, {
    get(_t, name) {
      trapCalls.push(String(name));
      return name === "then" ? function(r) { r("proxy"); } : undefined;
    },
  });
  const {promise, resolve} = Promise.withResolvers();
  resolve(thenable, true);
  assertEq(trapCalls.length, 0,
           "resolve(proxy, true) must not invoke the proxy 'get' trap sync");

  let v;
  promise.then(x => { v = x; });
  drainJobQueue();
  assertEq(v, "proxy");
  // In the deferred job, "then" is read and the returned function is called.
  assertEq(trapCalls[0], "then");
}
