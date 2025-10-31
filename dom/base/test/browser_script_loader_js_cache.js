const BASE_URL = "http://mochi.test:8888/browser/dom/base/test/";

function ev(event, file, hasElement = !!file) {
  return {
    event,
    url: file ? BASE_URL + file : undefined,
    hasElement,
  };
}
async function contentTask(item) {
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

    const event = item.events[0];
    if (
      event.event === param.event &&
      (!param.url || event.url === param.url) &&
      (event.hasElement ? param.id === "watchme" : !param.id)
    ) {
      dump("@@@ Got expected event: " + data + "\n");
      item.events.shift();
      if (item.events.length === 0) {
        resolve();
      }
    } else {
      dump("@@@ Got unexpected event: " + data + "\n");
      dump("@@@ Expected: " + JSON.stringify(event) + "\n");
    }
  };
  Services.obs.addObserver(observer, "ScriptLoaderTest");

  const script = content.document.createElement("script");
  script.id = "watchme";
  script.src = item.file;
  content.document.body.appendChild(script);

  await promise;

  Services.obs.removeObserver(observer, "ScriptLoaderTest");
}

async function runTests(tests) {
  await BrowserTestUtils.withNewTab(BASE_URL + "empty.html", async browser => {
    for (const test of tests) {
      ChromeUtils.clearResourceCache();
      Services.cache2.clear();

      for (let i = 0; i < test.items.length; i++) {
        const item = test.items[i];
        info(`start: ${test.title} (item ${i})`);
        if (item.clearMemory) {
          info("clear memory cache");
          ChromeUtils.clearResourceCache();
        }
        if (item.clearDisk) {
          info("clear disk cache");
          Services.cache2.clear();
        }
        await SpecialPowers.spawn(browser, [item], contentTask);
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
