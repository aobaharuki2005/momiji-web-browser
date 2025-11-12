/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "BlankDecoderModule.h"
#include "DecodedStream.h"
#include "ImageContainer.h"
#include "MediaData.h"
#include "MediaQueue.h"
#include "MediaTrackGraphImpl.h"
#include "MediaTrackListener.h"
#include "MockCubeb.h"
#include "VideoSegment.h"
#include "gmock/gmock.h"
#include "gtest/gtest.h"
#include "mozilla/gtest/WaitFor.h"
#include "nsJSEnvironment.h"

using mozilla::layers::ImageContainer;
using mozilla::layers::ImageUsageType;
using mozilla::media::TimeUnit;
using testing::ElementsAre;
using testing::Test;

namespace mozilla {
// Short-hand for DispatchToCurrentThread with a function.
#define DispatchFunction(f) \
  NS_DispatchToCurrentThread(NS_NewRunnableFunction(__func__, f))

enum MediaType { Audio = 1, Video = 2, AudioVideo = Audio | Video };

template <MediaType Type>
CopyableTArray<RefPtr<ProcessedMediaTrack>> CreateOutputTracks(
    MediaTrackGraphImpl* aGraph) {
  CopyableTArray<RefPtr<ProcessedMediaTrack>> outputTracks;
  if constexpr (Type & Audio) {
    outputTracks.AppendElement(
        aGraph->CreateForwardedInputTrack(MediaSegment::AUDIO));
  }
  if constexpr (Type & Video) {
    outputTracks.AppendElement(
        aGraph->CreateForwardedInputTrack(MediaSegment::VIDEO));
  }
  return outputTracks;
}

template <MediaType Type>
MediaInfo CreateMediaInfo() {
  MediaInfo info;
  info.mStartTime = TimeUnit::Zero();
  if constexpr (Type & Audio) {
    info.EnableAudio();
  }
  if constexpr (Type & Video) {
    info.EnableVideo();
  }
  return info;
}

class OnFallbackListener : public MediaTrackListener {
  const RefPtr<MediaTrack> mTrack;
  Atomic<bool> mOnFallback{true};

 public:
  explicit OnFallbackListener(MediaTrack* aTrack) : mTrack(aTrack) {}

  void Reset() { mOnFallback = true; }
  bool OnFallback() { return mOnFallback; }

  void NotifyOutput(MediaTrackGraph*, TrackTime) override {
    if (auto* ad =
            mTrack->GraphImpl()->CurrentDriver()->AsAudioCallbackDriver()) {
      mOnFallback = ad->OnFallback();
    }
  }
};

template <typename Segment>
class CapturingListener : public MediaTrackListener {
 public:
  Segment mSegment;

  void NotifyQueuedChanges(MediaTrackGraph* aGraph, TrackTime aTrackOffset,
                           const MediaSegment& aQueuedMedia) {
    mSegment.AppendSlice(aQueuedMedia, 0, aQueuedMedia.GetDuration());
  }
};

class TestableDecodedStream : public DecodedStream {
 public:
  TestableDecodedStream(
      AbstractThread* aOwnerThread,
      nsMainThreadPtrHandle<SharedDummyTrack> aDummyTrack,
      CopyableTArray<RefPtr<ProcessedMediaTrack>> aOutputTracks,
      AbstractCanonical<PrincipalHandle>* aCanonicalOutputPrincipal,
      double aVolume, double aPlaybackRate, bool aPreservesPitch,
      MediaQueue<AudioData>& aAudioQueue, MediaQueue<VideoData>& aVideoQueue)
      : DecodedStream(aOwnerThread, std::move(aDummyTrack),
                      std::move(aOutputTracks), aCanonicalOutputPrincipal,
                      aVolume, aPlaybackRate, aPreservesPitch, aAudioQueue,
                      aVideoQueue) {}

  using DecodedStream::GetPositionImpl;
  using DecodedStream::LastOutputSystemTime;
  using DecodedStream::LastVideoTimeStamp;
};

template <MediaType Type>
class TestDecodedStream : public Test {
 public:
  static constexpr TrackRate kRate = 48000;
  static constexpr uint32_t kChannels = 2;
  const RefPtr<MockCubeb> mMockCubeb;
  RefPtr<SmartMockCubebStream> mMockCubebStream;
  MediaQueue<AudioData> mAudioQueue;
  MediaQueue<VideoData> mVideoQueue;
  RefPtr<MediaTrackGraphImpl> mGraph;
  nsMainThreadPtrHandle<SharedDummyTrack> mDummyTrack;
  CopyableTArray<RefPtr<ProcessedMediaTrack>> mOutputTracks;
  Canonical<PrincipalHandle> mCanonicalOutputPrincipal;
  RefPtr<TestableDecodedStream> mDecodedStream;

  TestDecodedStream()
      : mMockCubeb(MakeRefPtr<MockCubeb>(MockCubeb::RunningMode::Manual)),
        mGraph(MediaTrackGraphImpl::GetInstance(
            MediaTrackGraph::SYSTEM_THREAD_DRIVER, /*Window ID*/ 1, kRate,
            nullptr, GetMainThreadSerialEventTarget())),
        mDummyTrack(new nsMainThreadPtrHolder<SharedDummyTrack>(
            __func__, new SharedDummyTrack(
                          mGraph->CreateSourceTrack(MediaSegment::AUDIO)))),
        mOutputTracks(CreateOutputTracks<Type>(mGraph)),
        mCanonicalOutputPrincipal(
            AbstractThread::GetCurrent(), PRINCIPAL_HANDLE_NONE,
            "TestDecodedStream::mCanonicalOutputPrincipal"),
        mDecodedStream(MakeRefPtr<TestableDecodedStream>(
            AbstractThread::GetCurrent(), mDummyTrack, mOutputTracks,
            &mCanonicalOutputPrincipal, /* aVolume = */ 1.0,
            /* aPlaybackRate = */ 1.0,
            /* aPreservesPitch = */ true, mAudioQueue, mVideoQueue)) {
    MOZ_ASSERT(NS_IsMainThread());
  };

  void SetUp() override {
    MOZ_ASSERT(NS_IsMainThread());
    CubebUtils::ForceSetCubebContext(mMockCubeb->AsCubebContext());

    for (const auto& track : mOutputTracks) {
      track->QueueSetAutoend(false);
    }

    // Resume the dummy track because a suspended audio track will not use an
    // AudioCallbackDriver.
    mDummyTrack->mTrack->Resume();

    RefPtr fallbackListener = new OnFallbackListener(mDummyTrack->mTrack);
    mDummyTrack->mTrack->AddListener(fallbackListener);

    mMockCubebStream = WaitFor(mMockCubeb->StreamInitEvent());
    while (mMockCubebStream->State().isNothing()) {
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    ASSERT_EQ(*mMockCubebStream->State(), CUBEB_STATE_STARTED);
    // Wait for the AudioCallbackDriver to come into effect.
    while (fallbackListener->OnFallback()) {
      ASSERT_EQ(mMockCubebStream->ManualDataCallback(1),
                MockCubebStream::KeepProcessing::Yes);
      std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
  }

  void TearDown() override {
    MOZ_ASSERT(NS_IsMainThread());
    // Destroy all tracks so they're removed from the graph.
    mDecodedStream->Shutdown();
    for (const auto& t : mOutputTracks) {
      t->Destroy();
    }
    mDummyTrack = nullptr;
    // DecodedStream also has a ref to the dummy track.
    mDecodedStream = nullptr;

    // Wait for the graph to shutdown. If all tracks are indeed removed, it will
    // not switch to another driver.
    MockCubebStream::KeepProcessing keepProcessing{};
    while ((keepProcessing = mMockCubebStream->ManualDataCallback(0)) ==
           MockCubebStream::KeepProcessing::Yes) {
      NS_ProcessPendingEvents(nullptr);
    }
    ASSERT_EQ(keepProcessing, MockCubebStream::KeepProcessing::No);

    // Process the final track removal and run the stable state runnable.
    NS_ProcessPendingEvents(nullptr);
    // Process the shutdown runnable.
    NS_ProcessPendingEvents(nullptr);

    // Graph should be shut down.
    ASSERT_TRUE(mGraph->OnGraphThreadOrNotRunning())
    << "Not on graph thread so graph must still be running!";
    ASSERT_EQ(mGraph->LifecycleStateRef(),
              MediaTrackGraphImpl::LIFECYCLE_WAITING_FOR_THREAD_SHUTDOWN)
        << "The graph should be in its final state. Note it does not advance "
           "the state any further on thread shutdown.";
    CubebUtils::ForceSetCubebContext(nullptr);

    // mGraph should be the last or second last reference to the graph. The last
    // reference may be the JS-based shutdown blocker, which will eventually be
    // destroyed by CC and GC.
    MediaTrackGraphImpl* graph{};
    mGraph.forget(&graph);
    int32_t refcnt = static_cast<int32_t>(graph->Release());
    EXPECT_LE(refcnt, 1);

    // Attempt to release the last reference to the graph, to avoid its lifetime
    // reaching into future tests.
    nsJSContext::CycleCollectNow(CCReason::API);
    nsJSContext::GarbageCollectNow(JS::GCReason::API);
    NS_ProcessPendingEvents(nullptr);
  }

  MediaInfo CreateMediaInfo() { return mozilla::CreateMediaInfo<Type>(); }

  void TestVideoTimestampsWithPlaybackRate(double aPlaybackRate);
};

using TestDecodedStreamA = TestDecodedStream<Audio>;
using TestDecodedStreamV = TestDecodedStream<Video>;
using TestDecodedStreamAV = TestDecodedStream<AudioVideo>;

TEST_F(TestDecodedStreamAV, StartStop) {
  mDecodedStream->Start(TimeUnit::Zero(), CreateMediaInfo());
  mDecodedStream->SetPlaying(true);
  mDecodedStream->Stop();
}

TEST_F(TestDecodedStreamA, LastOutputSystemTime) {
  auto start = AwakeTimeStamp::Now();
  BlankAudioDataCreator creator(2, kRate);
  auto raw = MakeRefPtr<MediaRawData>();
  raw->mDuration = TimeUnit(kRate, kRate);
  mAudioQueue.Push(RefPtr(creator.Create(raw))->As<AudioData>());

  mDecodedStream->Start(TimeUnit::Zero(), CreateMediaInfo());
  mDecodedStream->SetPlaying(true);
  NS_ProcessPendingEvents(nullptr);
  mMockCubebStream->ManualDataCallback(0);

  auto before = AwakeTimeStamp::Now();
  // This runs the events on the graph thread, sampling the system clock.
  mMockCubebStream->ManualDataCallback(512);
  auto after = AwakeTimeStamp::Now();
  // This runs the event handlers on the MDSM thread, updating the timestamps.
  NS_ProcessPendingEvents(nullptr);
  EXPECT_GE(mDecodedStream->LastOutputSystemTime() - start, before - start);
  EXPECT_LE(mDecodedStream->LastOutputSystemTime() - start, after - start);

  mDecodedStream->Stop();
}

TEST_F(TestDecodedStreamA, InterpolatedPosition) {
  BlankAudioDataCreator creator(2, kRate);
  auto raw = MakeRefPtr<MediaRawData>();
  raw->mDuration = TimeUnit(kRate, kRate);
  mAudioQueue.Push(RefPtr(creator.Create(raw))->As<AudioData>());

  mDecodedStream->Start(TimeUnit::Zero(), CreateMediaInfo());
  mDecodedStream->SetPlaying(true);
  NS_ProcessPendingEvents(nullptr);
  mMockCubebStream->ManualDataCallback(0);

  auto now = TimeStamp::Now();
  auto awakeNow = AwakeTimeStamp::Now();
  TimeStamp outNow;
  TimeUnit pos = mDecodedStream->GetPositionImpl(now, awakeNow, &outNow);
  EXPECT_EQ(now, outNow);
  EXPECT_EQ(pos, TimeUnit::Zero()) << pos.ToMilliseconds();

  mMockCubebStream->ManualDataCallback(512);
  NS_ProcessPendingEvents(nullptr);

  now += TimeDuration::FromSeconds(
      (mDecodedStream->LastOutputSystemTime() - awakeNow).ToSeconds());
  awakeNow = mDecodedStream->LastOutputSystemTime();
  pos = mDecodedStream->GetPositionImpl(now, awakeNow);
  EXPECT_EQ(pos.ToMicroseconds(), TimeUnit(512, kRate).ToMicroseconds());

  // Check that the position is interpolated based on wall clock time since last
  // output notification.
  now += TimeDuration::FromSeconds(
             (mDecodedStream->LastOutputSystemTime() - awakeNow).ToSeconds()) +
         TimeDuration::FromMilliseconds(10);
  awakeNow = mDecodedStream->LastOutputSystemTime() +
             AwakeTimeDuration::FromMilliseconds(10);
  pos = mDecodedStream->GetPositionImpl(now, awakeNow);
  EXPECT_EQ(pos.ToMicroseconds(),
            (TimeUnit(512, kRate) + TimeUnit(10, 1000)).ToMicroseconds());

  mDecodedStream->Stop();
}

template <MediaType Type>
void TestDecodedStream<Type>::TestVideoTimestampsWithPlaybackRate(
    double aPlaybackRate) {
  static_assert(Type == MediaType::Video);

  auto imageContainer = MakeRefPtr<ImageContainer>(ImageUsageType::Webrtc,
                                                   ImageContainer::SYNCHRONOUS);
  // Capture the output into a dedicated segment, that the graph will not prune
  // like it will for the output track's mSegment.
  RefPtr capturingListener = new CapturingListener<VideoSegment>();
  mOutputTracks[0]->AddListener(capturingListener);
  VideoSegment* segment = &capturingListener->mSegment;

  {
    // Add 4 video frames a 100ms each. Later we'll check timestamps of 3. We
    // add 4 here to make the 3rd frames duration deterministic.
    BlankVideoDataCreator creator(640, 480, imageContainer);
    TimeUnit t = TimeUnit::Zero();
    for (size_t i = 0; i < 4; ++i) {
      constexpr TimeUnit kDuration = TimeUnit(kRate / 10, kRate);
      auto raw = MakeRefPtr<MediaRawData>();
      raw->mTime = t;
      raw->mDuration = kDuration;
      t += kDuration;
      mVideoQueue.Push(RefPtr(creator.Create(raw))->template As<VideoData>());
    }
  }

  mDecodedStream->SetPlaybackRate(aPlaybackRate);
  mDecodedStream->Start(TimeUnit::Zero(), CreateMediaInfo());
  mDecodedStream->SetPlaying(true);
  NS_ProcessPendingEvents(nullptr);
  mMockCubebStream->ManualDataCallback(0);

  // Advance time enough to extract all 3 video frames.
  long duration = 0;
  while (duration < static_cast<long>((static_cast<double>(kRate) / 10) * 3 /
                                      aPlaybackRate)) {
    constexpr long kChunk = 512;
    mMockCubebStream->ManualDataCallback(kChunk);
    NS_ProcessPendingEvents(nullptr);
    duration += kChunk;
  }
  EXPECT_EQ(segment->GetDuration(), duration);

  // Calculate the expected timestamp of the first frame. At this point all
  // frames in the VideoQueue have been sent, so LastVideoTimeStamp() matches
  // the timestamp of frame 4.
  const auto frameGap =
      TimeDuration::FromMilliseconds(100).MultDouble(1 / aPlaybackRate);
  TimeStamp videoStartOffset =
      mDecodedStream->LastVideoTimeStamp() - frameGap * 3;

  // Check durations of the first 3 frames.
  AutoTArray<TrackTime, 3> durations;
  AutoTArray<TimeDuration, 3> timestamps;
  for (VideoSegment::ConstChunkIterator i(*segment);
       durations.Length() < 3 && !i.IsEnded(); i.Next()) {
    durations.AppendElement(i->GetDuration());
    timestamps.AppendElement(i->mTimeStamp - videoStartOffset);
  }
  const TrackTime d =
      static_cast<TrackTime>(static_cast<double>(kRate) / 10 / aPlaybackRate);
  EXPECT_THAT(durations, ElementsAre(d, d, d));
  EXPECT_THAT(timestamps,
              ElementsAre(frameGap * 0, frameGap * 1, frameGap * 2));

  mOutputTracks[0]->RemoveListener(capturingListener);
  mDecodedStream->Stop();
}

TEST_F(TestDecodedStreamV, VideoTimeStamps) {
  TestVideoTimestampsWithPlaybackRate(1.0);
}
TEST_F(TestDecodedStreamV, VideoTimeStampsFaster) {
  TestVideoTimestampsWithPlaybackRate(2.0);
}
TEST_F(TestDecodedStreamV, VideoTimeStampsSlower) {
  TestVideoTimestampsWithPlaybackRate(0.5);
}
}  // namespace mozilla
