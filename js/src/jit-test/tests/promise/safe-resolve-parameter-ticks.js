// |jit-test| skip-if: getBuildConfiguration("release_or_beta"); --enable-promise-safe-resolve
//
// resolve(thenable, true) adds exactly one extra microtask tick relative to
// resolve(thenable) — the DeferredResolveJob runs first, enqueues the
// normal PromiseResolveThenableJob, which then fulfills the outer promise.

// Baseline: resolve with a callable-then thenable, no safe-resolve.
// Tick 0 (sync): Get("then"), enqueue ThenableJob.
// Tick 1: ThenableJob runs -> thenable.then(rF, rJ) -> rF("v") -> fulfill.
// Tick 2: reaction fires.
{
  const thenable = {
    then(onFulfilled) { onFulfilled("baseline"); },
  };
  const {promise, resolve} = Promise.withResolvers();
  resolve(thenable);  // no safe-resolve

  let ticksAtFulfill = -1;
  let tick = 0;
  promise.then(() => { ticksAtFulfill = tick; });

  // Advance a bounded number of microtask turns and see when the reaction
  // runs. Build a chain using native Promises (not the synthetic one).
  let pending = Promise.resolve();
  for (let i = 0; i < 5; i++) {
    pending = pending.then(() => { tick++; });
  }
  drainJobQueue();
  assertEq(ticksAtFulfill >= 0, true, "reaction fired at some tick");
  // Record baseline tick count.
  var baselineTick = ticksAtFulfill;
}

// With safe-resolve: one extra tick.
{
  const thenable = {
    then(onFulfilled) { onFulfilled("safe"); },
  };
  const {promise, resolve} = Promise.withResolvers();
  resolve(thenable, true);

  let ticksAtFulfill = -1;
  let tick = 0;
  promise.then(() => { ticksAtFulfill = tick; });

  let pending = Promise.resolve();
  for (let i = 0; i < 5; i++) {
    pending = pending.then(() => { tick++; });
  }
  drainJobQueue();
  assertEq(ticksAtFulfill >= 0, true, "reaction fired at some tick");
  assertEq(ticksAtFulfill, baselineTick + 1,
           "resolve(thenable, true) takes exactly one extra microtask tick");
}

// Real Promise-with-Promise via safe-resolve: same +1 tick invariant.
{
  const inner = Promise.resolve("inner");
  const {promise: outerBase, resolve: rBase} = Promise.withResolvers();
  rBase(inner);  // baseline

  let baseTick = -1, tick = 0;
  outerBase.then(() => { baseTick = tick; });

  let chain = Promise.resolve();
  for (let i = 0; i < 6; i++) chain = chain.then(() => { tick++; });
  drainJobQueue();

  const inner2 = Promise.resolve("inner");
  const {promise: outerSafe, resolve: rSafe} = Promise.withResolvers();
  rSafe(inner2, true);

  let safeTick = -1, tick2 = 0;
  outerSafe.then(() => { safeTick = tick2; });

  let chain2 = Promise.resolve();
  for (let i = 0; i < 6; i++) chain2 = chain2.then(() => { tick2++; });
  drainJobQueue();

  assertEq(safeTick, baseTick + 1,
           "promise-with-promise via safe-resolve is +1 tick");
}
