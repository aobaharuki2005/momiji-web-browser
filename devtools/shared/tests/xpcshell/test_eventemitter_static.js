/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const {
  ConsoleAPIListener,
} = require("resource://devtools/server/actors/webconsole/listeners/console-api.js");
const {
  on,
  once,
  off,
  emit,
  count,
} = require("resource://devtools/shared/event-emitter.js");

const pass = message => ok(true, message);
const fail = message => ok(false, message);

/**
 * Each method of this object is a test; tests can be synchronous or asynchronous:
 *
 * 1. Plain method are synchronous tests.
 * 2. methods with `async` keyword are asynchronous tests.
 * 3. methods with `done` as argument are asynchronous tests (`done` needs to be called to
 *    complete the test).
 */
const TESTS = {
  testAddListener() {
    const events = [{ name: "event#1" }, "event#2"];
    const target = { name: "target" };

    on(target, "message", function (message) {
      equal(this, target, "this is a target object");
      equal(message, events.shift(), "message is emitted event");
    });

    emit(target, "message", events[0]);
    emit(target, "message", events[0]);
  },

  testListenerIsUniquePerType() {
    const actual = [];
    const target = {};
    listener = () => actual.push(1);

    on(target, "message", listener);
    on(target, "message", listener);
    on(target, "message", listener);
    on(target, "foo", listener);
    on(target, "foo", listener);

    emit(target, "message");
    deepEqual([1], actual, "only one message listener added");

    emit(target, "foo");
    deepEqual([1, 1], actual, "same listener added for other event");
  },

  testEventTypeMatters() {
    const target = { name: "target" };
    on(target, "message", () => fail("no event is expected"));
    on(target, "done", () => pass("event is emitted"));

    emit(target, "foo");
    emit(target, "done");
  },

  testAllArgumentsArePassed() {
    const foo = { name: "foo" },
      bar = "bar";
    const target = { name: "target" };

    on(target, "message", (a, b) => {
      equal(a, foo, "first argument passed");
      equal(b, bar, "second argument passed");
    });

    emit(target, "message", foo, bar);
  },

  testNoSideEffectsInEmit() {
    const target = { name: "target" };

    on(target, "message", () => {
      pass("first listener is called");

      on(target, "message", () => fail("second listener is called"));
    });
    emit(target, "message");
  },

  testCanRemoveNextListener() {
    const target = { name: "target" };

    on(target, "data", () => {
      pass("first listener called");
      off(target, "data", fail);
    });
    on(target, "data", fail);

    emit(target, "data", "Listener should be removed");
  },

  testOrderOfPropagation() {
    const actual = [];
    const target = { name: "target" };

    on(target, "message", () => actual.push(1));
    on(target, "message", () => actual.push(2));
    on(target, "message", () => actual.push(3));
    emit(target, "message");

    deepEqual([1, 2, 3], actual, "called in order they were added");
  },

  testRemoveListener() {
    const target = { name: "target" };
    const actual = [];

    on(target, "message", function listener() {
      actual.push(1);
      on(target, "message", () => {
        off(target, "message", listener);
        actual.push(2);
      });
    });

    emit(target, "message");
    deepEqual([1], actual, "first listener called");

    emit(target, "message");
    deepEqual([1, 1, 2], actual, "second listener called");

    emit(target, "message");
    deepEqual([1, 1, 2, 2, 2], actual, "first listener removed");
  },

  testRemoveAllListenersForType() {
    const actual = [];
    const target = { name: "target" };

    on(target, "message", () => actual.push(1));
    on(target, "message", () => actual.push(2));
    on(target, "message", () => actual.push(3));
    on(target, "bar", () => actual.push("b"));
    off(target, "message");

    emit(target, "message");
    emit(target, "bar");

    deepEqual(["b"], actual, "all message listeners were removed");
  },

  testRemoveAllListeners() {
    const actual = [];
    const target = { name: "target" };

    on(target, "message", () => actual.push(1));
    on(target, "message", () => actual.push(2));
    on(target, "message", () => actual.push(3));
    on(target, "bar", () => actual.push("b"));

    off(target);

    emit(target, "message");
    emit(target, "bar");

    deepEqual([], actual, "all listeners events were removed");
  },

  testFalsyArgumentsAreFine() {
    let type, listener;
    const target = { name: "target" },
      actual = [];
    on(target, "bar", () => actual.push(0));

    off(target, "bar", listener);
    emit(target, "bar");
    deepEqual([0], actual, "3rd bad arg will keep listener");

    off(target, type);
    emit(target, "bar");
    deepEqual([0, 0], actual, "2nd bad arg will keep listener");

    off(target, type, listener);
    emit(target, "bar");
    deepEqual([0, 0, 0], actual, "2nd & 3rd bad args will keep listener");
  },

  testUnhandledExceptions(done) {
    const listener = new ConsoleAPIListener(null, message => {
      equal(message.level, "error", "Got the first exception");
      equal(
        message.arguments[0].message,
        "Boom!",
        "unhandled exception is logged"
      );

      listener.destroy();
      done();
    });

    listener.init();

    const target = {};

    on(target, "message", () => {
      throw Error("Boom!");
    });

    emit(target, "message");
  },

  testCount() {
    const target = { name: "target" };

    equal(count(target, "foo"), 0, "no listeners for 'foo' events");
    on(target, "foo", () => {});
    equal(count(target, "foo"), 1, "listener registered");
    on(target, "foo", () => {});
    equal(count(target, "foo"), 2, "another listener registered");
    off(target);
    equal(count(target, "foo"), 0, "listeners unregistered");
  },

  async testOnce() {
    const target = { name: "target" };
    const called = false;

    const pFoo = once(target, "foo", function (value) {
      ok(!called, "listener called only once");
      equal(value, "bar", "correct argument was passed");
      equal(this, target, "the contextual object is correct");
    });
    const pDone = once(target, "done");

    emit(target, "foo", "bar");
    emit(target, "foo", "baz");
    emit(target, "done", "");

    await Promise.all([pFoo, pDone]);
  },

  testRemovingOnce(done) {
    const target = { name: "target" };

    once(target, "foo", fail);
    once(target, "done", done);

    off(target, "foo", fail);

    emit(target, "foo", "listener was called");
    emit(target, "done", "");
  },

  testCallingOffWithMoreThan3Args() {
    const target = { name: "target" };
    on(target, "data", fail);
    off(target, "data", fail, undefined);
    emit(target, "data", "Listener should be removed");
  },
};

/**
 * Create a runnable tests based on the tests descriptor given.
 *
 * @param {Object} tests
 *  The tests descriptor object, contains the tests to run.
 */
const runnable = tests =>
  async function () {
    for (const name of Object.keys(tests)) {
      info(name);
      if (tests[name].length === 1) {
        await new Promise(resolve => tests[name](resolve));
      } else {
        await tests[name]();
      }
    }
  };

add_task(runnable(TESTS));
