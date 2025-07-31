const { Subprocess } = ChromeUtils.importESModule(
  "resource://gre/modules/Subprocess.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

add_task(async function test_omnijar_loading() {
  TestUtils.assertPackagedBuild();
  let path = Services.dirsvc.get("GreBinD", Ci.nsIFile);
  path.append("crashreporter");

  const proc = await Subprocess.call({
    command: path.path,
    arguments: [],
    environment: {
      MOZ_CRASHREPORTER_AUTO_SUBMIT: "1",
    },
    stderr: "pipe",
  });

  await proc.wait();
  let stderr = await proc.stderr.readString();
  stderr = stderr.trim();
  Assert.equal(stderr.length, 0, `expected empty stderr, got:\n${stderr}`);
});
