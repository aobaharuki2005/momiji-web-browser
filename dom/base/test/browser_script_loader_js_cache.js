const BASE_URL = "http://mochi.test:8888/browser/dom/base/test/";

function ev(event, file, hasElement = !!file) {
  return {
    event,
    url: file ? BASE_URL + file : undefined,
    hasElement,
  };
}

function unordered(list) {
  return {
    unordered: list,
  };
}

async function contentTask(test, item) {
  function match(param, event) {
    if (event.event !== param.event) {
      return false;
    }

    if (param.url && event.url !== param.url) {
      return false;
    }

    if (event.hasElement) {
      if (param.id !== "watchme") {
        return false;
      }
    } else {
      if (param.id) {
        return false;
      }
    }

    return true;
  }

  function consumeIfMatched(param, events) {
    if ("unordered" in events[0]) {
      const unordered = events[0].unordered;
      for (let i = 0; i < unordered.length; i++) {
        if (match(param, unordered[i])) {
          unordered.splice(i, 1);
          if (!unordered.length) {
            events.shift();
          }
          return true;
        }
      }

      return false;
    }

    if (match(param, events[0])) {
      events.shift();
      return true;
    }

    return false;
  }

  const { promise, resolve, reject } = Promise.withResolvers();
  const observer = function (subject, topic, data) {
    const param = {};
    for (const line of data.split("\n")) {
      const m = line.match(/^([^:]+):(.*)/);
      param[m[1]] = m[2];
    }

    if (param.event === "compile:main thread") {
      return;
    }

    if (consumeIfMatched(param, item.events)) {
      dump("@@@ Got expected event: " + data + "\n");
      if (item.events.length === 0) {
        resolve();
      }
    } else {
      dump("@@@ Got unexpected event: " + data + "\n");
      dump("@@@ Expected: " + JSON.stringify(item.events[0]) + "\n");
    }
  };
  Services.obs.addObserver(observer, "ScriptLoaderTest");

  const script = content.document.createElement("script");
  script.id = "watchme";
  if (test.module || item.module) {
    script.type = "module";
  }
  script.src = item.file;
  content.document.body.appendChild(script);

  await promise;

  Services.obs.removeObserver(observer, "ScriptLoaderTest");
}

async function runTests(tests) {
  await BrowserTestUtils.withNewTab(BASE_URL + "empty.html", async browser => {
    const tab = gBrowser.getTabForBrowser(browser);

    for (const test of tests) {
      ChromeUtils.clearResourceCache();
      Services.cache2.clear();

      for (let i = 0; i < test.items.length; i++) {
        const item = test.items[i];
        info(`start: ${test.title} (item ${i})`);

        // Make sure the test starts in clean document.
        await BrowserTestUtils.reloadTab(tab);

        if (item.clearMemory) {
          info("clear memory cache");
          ChromeUtils.clearResourceCache();
        }
        if (item.clearDisk) {
          info("clear disk cache");
          Services.cache2.clear();
        }
        await SpecialPowers.spawn(browser, [test, item], contentTask);
      }

      ok(true, "end: " + test.title);
    }
  });

  ok(true, "Finished all tests");
}

add_task(async function testDiskCache() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", false],
    ],
  });

  await runTests([
    // A small file shouldn't be saved to the disk.
    {
      title: "small file",
      items: [
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
      ],
    },

    // A large file should be saved to the disk on the 4th load, and should be
    // used on the 5th load.  Also the 5th load shouldn't overwrite the cache.
    {
      title: "large file",
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
      ],
    },

    // A file with compile error shouldn't be saved to the disk.
    {
      title: "syntax error",
      items: [
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:disabled", "file_js_cache_large_syntax_error.js"),
          ],
        },
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:disabled", "file_js_cache_large_syntax_error.js"),
          ],
        },
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:disabled", "file_js_cache_large_syntax_error.js"),
          ],
        },
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:disabled", "file_js_cache_large_syntax_error.js"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testMemoryCache() {
  if (!AppConstants.NIGHTLY_BUILD) {
    todo(false, "navigation cache is not yet enabled on non-nightly");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
    ],
  });

  // If in-memory cache is enabled, the disk cache is handled by the
  // SharedScriptCache, and following differences happen:
  //  * diskcache:disabled and diskcache:register are not notified for
  //    each script
  //  * diskcache:noschedule is notified without associated script
  //    if there's no script to be saved

  await runTests([
    // A small file should be saved to the memory on the 1st load, and used on
    // the 2nd load.  But it shouldn't be saved to the disk cache.
    {
      title: "small file",
      items: [
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("memorycache:saved", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:memorycache", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:memorycache", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:memorycache", "file_js_cache_small.js"),
            ev("evaluate:classic", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    // A large file should be saved to the memory on the 1st load, and used on
    // the 2nd load.  Also it should be saved to the disk on the 4th load.
    // Also the 5th load shouldn't overwrite the cache.
    // Once the memory cache is purged, it should be populated from the disk
    // cache response.
    {
      title: "large file",
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },

        {
          clearMemory: true,
          file: "file_js_cache_large.js",
          events: [
            ev("load:diskcache", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    // A file with compile error shouldn't be saved to any cache.
    {
      title: "syntax error",
      items: [
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large_syntax_error.js",
          events: [
            ev("load:source", "file_js_cache_large_syntax_error.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testDiskCache_modules() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", false],
    ],
  });

  await runTests([
    // A small module shouldn't be saved to the disk.
    {
      title: "small module",
      module: true,
      items: [
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:disabled", "file_js_cache_small.js"),
          ],
        },
      ],
    },

    // A large module file should be saved to the disk.
    {
      title: "large module",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
      ],
    },

    // All imported modules should be saved to the disk.
    {
      title: "imported modules",
      module: true,
      items: [
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_importer.mjs"),
            ev("load:source", "file_js_cache_imported1.mjs", false),
            ev("load:source", "file_js_cache_imported2.mjs", false),
            ev("load:source", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_importer.mjs"),
            // non-top-level modules that don't pass the condition
            // don't emit events.
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_importer.mjs"),
            ev("load:source", "file_js_cache_imported1.mjs", false),
            ev("load:source", "file_js_cache_imported2.mjs", false),
            ev("load:source", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_importer.mjs"),
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_importer.mjs"),
            ev("load:source", "file_js_cache_imported1.mjs", false),
            ev("load:source", "file_js_cache_imported2.mjs", false),
            ev("load:source", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_importer.mjs"),
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_importer.mjs"),
            ev("load:source", "file_js_cache_imported1.mjs", false),
            ev("load:source", "file_js_cache_imported2.mjs", false),
            ev("load:source", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:register", "file_js_cache_importer.mjs"),
            ev("diskcache:register", "file_js_cache_imported1.mjs", false),
            ev("diskcache:register", "file_js_cache_imported2.mjs", false),
            ev("diskcache:register", "file_js_cache_imported3.mjs", false),
            ev("diskcache:saved", "file_js_cache_importer.mjs", false),
            ev("diskcache:saved", "file_js_cache_imported1.mjs", false),
            ev("diskcache:saved", "file_js_cache_imported2.mjs", false),
            ev("diskcache:saved", "file_js_cache_imported3.mjs", false),
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:diskcache", "file_js_cache_importer.mjs"),
            ev("load:diskcache", "file_js_cache_imported1.mjs", false),
            ev("load:diskcache", "file_js_cache_imported2.mjs", false),
            ev("load:diskcache", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:disabled", "file_js_cache_importer.mjs"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testMemoryCache_modules() {
  if (!AppConstants.NIGHTLY_BUILD) {
    todo(false, "navigation cache is not yet enabled on non-nightly");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
    ],
  });

  await runTests([
    // A small module shouldn't be saved to the disk.
    {
      title: "small module",
      module: true,
      items: [
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:source", "file_js_cache_small.js"),
            ev("memorycache:saved", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:memorycache", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:memorycache", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_small.js",
          events: [
            ev("load:memorycache", "file_js_cache_small.js"),
            ev("evaluate:module", "file_js_cache_small.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    // A large module file should be saved to the disk.
    {
      title: "large module",
      module: true,
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    // All imported modules should be saved to the disk.
    {
      title: "imported modules",
      module: true,
      items: [
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:source", "file_js_cache_importer.mjs"),
            ev("memorycache:saved", "file_js_cache_importer.mjs"),
            ev("load:source", "file_js_cache_imported1.mjs", false),
            ev("memorycache:saved", "file_js_cache_imported1.mjs", false),
            ev("load:source", "file_js_cache_imported2.mjs", false),
            ev("memorycache:saved", "file_js_cache_imported2.mjs", false),
            ev("load:source", "file_js_cache_imported3.mjs", false),
            ev("memorycache:saved", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_importer.mjs"),
            ev("load:memorycache", "file_js_cache_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_importer.mjs"),
            ev("load:memorycache", "file_js_cache_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_importer.mjs"),
            ev("load:memorycache", "file_js_cache_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            // SharedScriptCache iterates over unordered hashmap while
            // saving.
            unordered([
              ev("diskcache:saved", "file_js_cache_importer.mjs", false),
              ev("diskcache:saved", "file_js_cache_imported1.mjs", false),
              ev("diskcache:saved", "file_js_cache_imported2.mjs", false),
              ev("diskcache:saved", "file_js_cache_imported3.mjs", false),
            ]),
          ],
        },
        {
          file: "file_js_cache_importer.mjs",
          events: [
            ev("load:memorycache", "file_js_cache_importer.mjs"),
            ev("load:memorycache", "file_js_cache_imported1.mjs", false),
            ev("load:memorycache", "file_js_cache_imported2.mjs", false),
            ev("load:memorycache", "file_js_cache_imported3.mjs", false),
            ev("evaluate:module", "file_js_cache_importer.mjs"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testDiskCache_classicVsModules() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", false],
    ],
  });

  await runTests([
    // A classic script's disk cache shouldn't be used by module.
    // A large module file should be saved to the disk.
    {
      title: "classic script disk cache vs module",
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            // This should load source.
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
      ],
    },

    {
      title: "module script disk cache vs classic",
      items: [
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:disabled", "file_js_cache_large.js"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            // This should load source.
            ev("load:source", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:register", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});

add_task(async function testMemoryCache_classicVsModules() {
  if (!AppConstants.NIGHTLY_BUILD) {
    todo(false, "navigation cache is not yet enabled on non-nightly");
    return;
  }

  await SpecialPowers.pushPrefEnv({
    set: [
      ["dom.expose_test_interfaces", true],
      ["dom.script_loader.bytecode_cache.enabled", true],
      ["dom.script_loader.bytecode_cache.strategy", 0],
      ["dom.script_loader.experimental.navigation_cache", true],
    ],
  });

  await runTests([
    // A classic script's disk cache shouldn't be used by module.
    // A large module file should be saved to the disk.
    {
      title: "classic script disk cache vs module",
      items: [
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            // Memory cached item is classic.
            // Module load should immediately fetch source from necko.
            ev("load:source", "file_js_cache_large.js"),
            // and save a separate item.
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },

    {
      title: "module script disk cache vs script",
      items: [
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
        {
          file: "file_js_cache_large.js",
          module: true,
          events: [
            ev("load:memorycache", "file_js_cache_large.js"),
            ev("evaluate:module", "file_js_cache_large.js"),
            ev("diskcache:saved", "file_js_cache_large.js", false),
          ],
        },
        {
          file: "file_js_cache_large.js",
          events: [
            ev("load:source", "file_js_cache_large.js"),
            ev("memorycache:saved", "file_js_cache_large.js"),
            ev("evaluate:classic", "file_js_cache_large.js"),
            ev("diskcache:noschedule"),
          ],
        },
      ],
    },
  ]);

  await SpecialPowers.popPrefEnv();
});
