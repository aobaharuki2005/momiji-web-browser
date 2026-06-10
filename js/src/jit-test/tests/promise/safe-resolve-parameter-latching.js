// |jit-test| skip-if: getBuildConfiguration("release_or_beta"); --enable-promise-safe-resolve
//
// Latching: resolve(x, true) must immediately make the resolving functions
// no-ops, even when the resolution itself is deferred.

// 1. After resolve(thenable, true), a follow-up resolve() or reject() is a
//    silent no-op — even though the deferred job hasn't run yet.
{
  const thenable = {
    then(onFulfilled) { onFulfilled("from-thenable"); },
  };

  const {promise, resolve, reject} = Promise.withResolvers();
  resolve(thenable, true);  // deferred
  resolve("second");        // must be no-op
  reject("bad");            // must be no-op

  let settled = null, failed = null;
  promise.then(v => { settled = v; }, e => { failed = e; });
  drainJobQueue();
  assertEq(failed, null);
  assertEq(settled, "from-thenable");
}

// 2. Fast-path resolve(x, true) also latches immediately.
{
  const {promise, resolve, reject} = Promise.withResolvers();
  resolve(123, true);  // non-object, fast path
  resolve("second");
  reject("bad");

  let v, e;
  promise.then(x => { v = x; }, err => { e = err; });
  drainJobQueue();
  assertEq(e, undefined);
  assertEq(v, 123);
}

// 3. Two resolve(_, true) calls: second is a no-op; first wins.
{
  const t1 = {then(r) { r("first"); }};
  const t2 = {then(r) { r("second"); }};
  const {promise, resolve} = Promise.withResolvers();
  resolve(t1, true);
  resolve(t2, true);

  let v;
  promise.then(x => { v = x; });
  drainJobQueue();
  assertEq(v, "first");
}

// 4. After the promise has naturally settled (via a prior resolve(x)),
//    calling resolve(y, true) is a silent no-op (the latched resolve
//    function early-returns before checking doSafeResolve).
{
  const {promise, resolve} = Promise.withResolvers();
  resolve("preset");
  resolve({then(r){ r("ignored"); }}, true);

  let v;
  promise.then(x => { v = x; });
  drainJobQueue();
  assertEq(v, "preset");
}

// 5. Self-resolution (resolve(promise, true)) goes through the deferred job,
//    which detects it and rejects with TypeError.
{
  const {promise, resolve} = Promise.withResolvers();
  resolve(promise, true);

  let result = null;
  promise.then(v => { result = {fulfilled: v}; },
               e => { result = {rejected: e}; });
  drainJobQueue();
  assertEq(result !== null, true);
  assertEq("rejected" in result, true);
  assertEq(result.rejected instanceof TypeError, true);
}

// 6. Promise is observably pending during the deferral window.
{
  const {promise, resolve} = Promise.withResolvers();
  const thenable = {then(r) { r("eventually"); }};

  let fired = false;
  promise.then(() => { fired = true; });

  resolve(thenable, true);
  // Latched, but the promise is still pending; reaction hasn't fired.
  assertEq(fired, false);

  drainJobQueue();
  assertEq(fired, true);
}
