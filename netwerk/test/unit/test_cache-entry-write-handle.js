"use strict";

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

const { XPCShellContentUtils } = ChromeUtils.importESModule(
  "resource://testing-common/XPCShellContentUtils.sys.mjs"
);

XPCShellContentUtils.ensureInitialized(this);

const responseContent = "response body";

// NOTE: This is executed both on the parent process and the content process.
//       Some variables are re-defined.
async function testTask(port, path, responseContent) {
  const { NetUtil } = ChromeUtils.importESModule(
    "resource://gre/modules/NetUtil.sys.mjs"
  );

  function makeChannel(url) {
    return NetUtil.newChannel({ uri: url, loadUsingSystemPrincipal: true });
  }

  const FILE_URL = "http://localhost:" + port + path;

  const altContent = "altData";
  const altContentType = "text/binary";

  const nonAltChan = makeChannel(FILE_URL);
  nonAltChan
    .QueryInterface(Ci.nsICacheInfoChannel)
    .preferAlternativeDataType(
      altContentType,
      "",
      Ci.nsICacheInfoChannel.ASYNC
    );

  const { promise: handlePromise, resolve: handleResolve } =
    Promise.withResolvers();

  function ChannelListener(callback) {
    this._callback = callback;
    this._buffer = "";
  }
  ChannelListener.prototype = {
    QueryInterface: ChromeUtils.generateQI([
      "nsIStreamListener",
      "nsIRequestObserver",
    ]),

    onStartRequest(_request) {},

    onDataAvailable(request, stream, offset, count) {
      const bi = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
        Ci.nsIBinaryInputStream
      );
      bi.setInputStream(stream);
      while (count > 0) {
        const bytes = bi.readByteArray(Math.min(65535, count));
        this._buffer += String.fromCharCode.apply(null, bytes);
        count -= bytes.length;
      }
    },

    onStopRequest(request, _status) {
      this._callback(request, this._buffer);
    },
  };

  nonAltChan.asyncOpen(
    new ChannelListener((request, buffer) => {
      const cc = request.QueryInterface(Ci.nsICacheInfoChannel);

      Assert.equal(buffer, responseContent);
      Assert.equal(cc.alternativeDataType, "");

      handleResolve(cc.getCacheEntryWriteHandle());
    })
  );

  const handle = await handlePromise;

  const os = handle.openAlternativeOutputStream(
    altContentType,
    altContent.length
  );
  os.write(altContent, altContent.length);
  os.close();

  const altChan = makeChannel(FILE_URL);
  altChan
    .QueryInterface(Ci.nsICacheInfoChannel)
    .preferAlternativeDataType(
      altContentType,
      "",
      Ci.nsICacheInfoChannel.ASYNC
    );

  const { promise: altDataPromise, resolve: altDataResolve } =
    Promise.withResolvers();

  altChan.asyncOpen(
    new ChannelListener((request, buffer) => {
      const cc = request.QueryInterface(Ci.nsICacheInfoChannel);

      Assert.equal(buffer, altContent);
      Assert.equal(cc.alternativeDataType, altContentType);

      altDataResolve();
    })
  );

  await altDataPromise;
}

let httpServer;

add_setup(async function setup() {
  httpServer = new HttpServer();
  httpServer.registerPathHandler("/page", (metadata, response) => {
    response.setHeader("Content-Type", "text/plain");
    response.setHeader("Cache-Control", "max-age=86400");

    response.bodyOutputStream.write("", 0);
  });
  httpServer.registerPathHandler("/content1", (metadata, response) => {
    response.setHeader("Content-Type", "text/plain");
    response.setHeader("Cache-Control", "max-age=86400");

    response.bodyOutputStream.write(responseContent, responseContent.length);
  });
  httpServer.registerPathHandler("/content2", (metadata, response) => {
    response.setHeader("Content-Type", "text/plain");
    response.setHeader("Cache-Control", "max-age=86400");

    response.bodyOutputStream.write(responseContent, responseContent.length);
  });
  httpServer.start(-1);

  registerCleanupFunction(async () => {
    await new Promise(resolve => httpServer.stop(resolve));
  });
});

add_task(async function test_CacheEntryWriteHandle_ParentProcess() {
  const port = httpServer.identity.primaryPort;

  testTask(port, "/content1", responseContent);
});

add_task(async function test_CacheEntryWriteHandle_ContentProcess() {
  const port = httpServer.identity.primaryPort;
  const PAGE_URL = "http://localhost:" + port + "/page";

  const page = await XPCShellContentUtils.loadContentPage(PAGE_URL, {
    remote: true,
  });

  await page.spawn([port, "/content2", responseContent], testTask);
});
