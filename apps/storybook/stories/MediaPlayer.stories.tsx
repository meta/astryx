// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {useEffect, useRef, useState, type RefObject} from 'react';
import {
  AudioPlayer,
  MediaMuteButton,
  MediaPlayButton,
  MediaPlayer,
  MediaPlayerAudio,
  MediaPlayerVideo,
  MediaTime,
  MediaTimeSlider,
  VideoPlayer,
  useMediaPlayer,
} from '@astryxdesign/lab';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Text} from '@astryxdesign/core/Text';
import {
  durationVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';

// CC0 sample media.
const VIDEO_SRC =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm';
const AUDIO_SRC =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3';
const ARTWORK_SRC =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-images/grapefruit-slice-332-332.jpg';

const CAPTIONS_VTT = `WEBVTT

00:00.000 --> 00:02.500
A bee lands on a pink flower.

00:02.500 --> 00:05.000
It gathers pollen and flies away.
`;

/** Serves the sample captions from a same-origin blob URL. */
function useCaptionsUrl() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const next = URL.createObjectURL(
      new Blob([CAPTIONS_VTT], {type: 'text/vtt'}),
    );
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, []);
  return url;
}

const CHAPTERS = [
  {start: 0, title: 'Arrival'},
  {start: 1.6, title: 'Pollen'},
  {start: 3.4, title: 'Take-off'},
];

const COMMENT_MARKERS = [
  {time: 0.8, label: 'Ana Ruiz: Love the light here.'},
  {time: 2.2, label: 'Lin Park: Can we hold on this?'},
  {time: 3.9, label: 'Mira Chen: Cut before the blur.'},
];

const styles = stylex.create({
  frame: {
    position: 'relative',
    width: '100%',
  },
  // Sits where the control bar sits: one bar inset from the edges.
  ticker: {
    position: 'absolute',
    insetInline: spacingVars['--spacing-2'],
    insetBlockEnd: spacingVars['--spacing-2'],
    pointerEvents: 'none',
    opacity: 0,
    transitionProperty: 'opacity',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
  },
  tickerShown: {
    opacity: 1,
  },
  feed: {
    position: 'relative',
    width: 360,
    maxWidth: '100%',
    aspectRatio: '9 / 12',
    overflow: 'hidden',
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: 'black',
  },
  feedVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  feedMute: {
    position: 'absolute',
    insetBlockStart: spacingVars['--spacing-2'],
    insetInlineEnd: spacingVars['--spacing-2'],
    color: 'white',
    backgroundColor: 'oklch(0 0 0 / 0.45)',
    borderRadius: radiusVars['--radius-full'],
  },
  feedTicker: {
    position: 'absolute',
    insetInline: spacingVars['--spacing-2'],
    insetBlockEnd: spacingVars['--spacing-2'],
  },
});

/**
 * Reads a VideoPlayer's clock and controls state from outside it, for the
 * ticker story only.
 */
function usePlaybackOf(frameRef: RefObject<HTMLDivElement | null>) {
  const [playback, setPlayback] = useState({
    time: 0,
    duration: 0,
    isBarHidden: false,
  });
  // Syncs the snapshot with the video element and the player root.
  useEffect(() => {
    const frame = frameRef.current;
    const video = frame?.querySelector('video');
    const root = frame?.querySelector('[data-controls]');
    if (video == null || root == null) {
      return;
    }
    let frameId = 0;
    // Animation frames keep the ticker smooth between time updates.
    const tick = () => {
      setPlayback({
        time: video.currentTime,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        isBarHidden: root.getAttribute('data-controls') === 'hidden',
      });
      frameId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, [frameRef]);
  return playback;
}

function TickerWhenBarHides() {
  const frameRef = useRef<HTMLDivElement>(null);
  const playback = usePlaybackOf(frameRef);
  return (
    <div ref={frameRef} {...stylex.props(styles.frame)}>
      <VideoPlayer src={VIDEO_SRC} label="Bee on a flower" isLooping />
      {/* The timeline already reports progress, so the ticker is hidden from
          assistive technology. */}
      <div
        aria-hidden
        {...stylex.props(
          styles.ticker,
          playback.isBarHidden && styles.tickerShown,
        )}>
        <ProgressBar
          label="Playback progress"
          isLabelHidden
          value={playback.time}
          max={playback.duration || 1}
        />
      </div>
    </div>
  );
}

function FeedTicker() {
  const {state} = useMediaPlayer();
  return (
    <div aria-hidden {...stylex.props(styles.feedTicker)}>
      <ProgressBar
        label="Playback progress"
        isLabelHidden
        value={state.currentTime}
        max={state.duration || 1}
      />
    </div>
  );
}

const meta: Meta<typeof VideoPlayer> = {
  title: 'Lab/MediaPlayer',
  component: VideoPlayer,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div style={{width: 720, maxWidth: '100%'}}>
        <Story />
      </div>
    ),
  ],
  args: {
    src: VIDEO_SRC,
    label: 'Bee on a flower',
  },
};

export default meta;

type Story = StoryObj<typeof VideoPlayer>;

export const Video: Story = {};

export const VideoWithCaptions: Story = {
  render: args => {
    const captionsUrl = useCaptionsUrl();
    if (captionsUrl == null) {
      return <div />;
    }
    return (
      <VideoPlayer
        {...args}
        captions={[
          {src: captionsUrl, label: 'English', language: 'en', isDefault: true},
        ]}
      />
    );
  },
};

export const MutedAutoplayLoop: Story = {
  args: {
    hasAutoPlay: true,
    isLooping: true,
  },
};

export const RightToLeft: Story = {
  render: args => (
    <div dir="rtl">
      <VStack gap={2}>
        <Text type="supporting" color="secondary">
          The page reads right to left; the timeline still runs left to right
        </Text>
        <VideoPlayer {...args} />
      </VStack>
    </div>
  ),
};

export const Audio: Story = {
  render: () => (
    <AudioPlayer
      src={AUDIO_SRC}
      title="Designing for every screen"
      subtitle="The Interface Show · Episode 12"
      onPreviousTrack={() => {}}
      onNextTrack={() => {}}
    />
  ),
};

/** Cover art in front of the title, square by default. */
export const AudioWithArtwork: Story = {
  render: () => (
    <AudioPlayer
      src={AUDIO_SRC}
      title="Designing for every screen"
      subtitle="The Interface Show · Episode 12"
      artworkSrc={ARTWORK_SRC}
      onPreviousTrack={() => {}}
      onNextTrack={() => {}}
    />
  ),
};

/** Wide artwork, such as a video still, through `artworkAspectRatio`. */
export const AudioWithWideArtwork: Story = {
  render: () => (
    <AudioPlayer
      src={AUDIO_SRC}
      title="Designing for every screen"
      subtitle="The Interface Show · Episode 12"
      artworkSrc={ARTWORK_SRC}
      artworkAspectRatio={16 / 9}
    />
  ),
};

function ElapsedPercent() {
  const {state} = useMediaPlayer();
  const percent = state.duration > 0 ? state.currentTime / state.duration : 0;
  return (
    <Text type="supporting" color="secondary">
      {Math.round(percent * 100)}%
    </Text>
  );
}

export const CustomLayout: Story = {
  render: () => (
    <MediaPlayer label="Voice memo">
      <MediaPlayerAudio src={AUDIO_SRC} />
      <HStack gap={2} vAlign="center">
        <MediaPlayButton />
        <MediaTimeSlider />
        <MediaTime display="remaining" />
        <ElapsedPercent />
      </HStack>
    </MediaPlayer>
  ),
};

/**
 * Chapters split the timeline into segments with a small gap between them.
 * A pointer over the timeline previews the time and the chapter title, and
 * the timeline speaks the chapter with the time.
 */
export const Chapters: Story = {
  args: {
    chapters: CHAPTERS,
  },
};

/**
 * Timestamped comments as markers on the timeline. A pointer near a marker
 * previews its comment, and the timeline speaks the comment when its value
 * reaches the marker.
 */
export const CommentMarkers: Story = {
  args: {
    markers: COMMENT_MARKERS,
  },
};

/**
 * The lighter part of the track is the buffered range: media the browser
 * has loaded ahead of the playback position. The sample clip is small, so
 * throttle the network in the browser's developer tools to watch it grow.
 */
export const BufferedRange: Story = {
  args: {
    preload: 'auto',
  },
};

/**
 * A ProgressBar ticker takes the bar's place while the controls hide, like
 * a thin progress line. Play the video and wait two seconds.
 */
export const ProgressTicker: Story = {
  render: () => <TickerWhenBarHides />,
};

/**
 * A feed clip with no control bar: it plays muted on a loop, and a
 * ProgressBar ticker is its only timeline.
 */
export const FeedClip: Story = {
  render: () => (
    <MediaPlayer label="Bee on a flower" xstyle={styles.feed}>
      <MediaPlayerVideo
        src={VIDEO_SRC}
        autoPlay
        muted
        loop
        playsInline
        xstyle={styles.feedVideo}
      />
      <MediaMuteButton xstyle={styles.feedMute} />
      <FeedTicker />
    </MediaPlayer>
  ),
};
