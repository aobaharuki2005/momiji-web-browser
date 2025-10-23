// Helper functions checking video flow using HTMLVideoElement.

async function test_framerate_between_exclusive(t, track, lower, upper) {
  const video = document.createElement("video");
  document.body.appendChild(video);
  video.style = "width:320px;height:240px;"
  t.add_cleanup(async () => document.body.removeChild(video));

  video.srcObject = new MediaStream([track]);
  await video.play();

  const numSeconds = 2;
  await new Promise(r => setTimeout(r, numSeconds * 1000));
  const totalVideoFrames = video.mozPaintedFrames;
  assert_between_exclusive(totalVideoFrames / numSeconds, lower, upper, "totalVideoFrames");
}
