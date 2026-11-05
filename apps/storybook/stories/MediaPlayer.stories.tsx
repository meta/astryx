// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {useEffect, useState} from 'react';
import {
  AudioPlayer,
  CommentThread,
  MediaPlayButton,
  MediaPlayer,
  MediaPlaybackRate,
  MediaPlayerElement,
  MediaTime,
  MediaTimeSlider,
  MediaVolume,
  VideoPlayer,
  useMediaPlaybackTime,
  useMediaPlayer,
} from '@astryxdesign/lab';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {MediaTheme} from '@astryxdesign/core/theme';
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

const VIEWER = {id: 'sam', name: 'Sam Lee'};
const ANA = {id: 'ana', name: 'Ana Ruiz'};
const LIN = {id: 'lin', name: 'Lin Park'};
const MIRA = {id: 'mira', name: 'Mira Chen'};

const COMMENT_THREADS = [
  {
    time: 0.8,
    thread: {
      id: 'c1',
      author: ANA,
      body: 'Love the light here.',
      createdAt: '2026-11-04T17:02:00Z',
      replies: [
        {
          id: 'c1-r1',
          author: LIN,
          body: 'Same. Can we keep this take?',
          createdAt: '2026-11-04T17:10:00Z',
        },
      ],
    },
  },
  {
    time: 2.2,
    thread: {
      id: 'c2',
      author: LIN,
      body: 'Can we hold on this for a beat longer?',
      createdAt: '2026-11-04T17:05:00Z',
    },
  },
  {
    time: 3.9,
    thread: {
      id: 'c3',
      author: MIRA,
      body: 'Cut before the blur.',
      createdAt: '2026-11-04T17:20:00Z',
      isUnread: true,
    },
  },
];

const COMMENT_MARKERS = COMMENT_THREADS.map(({time, thread}) => ({
  time,
  label: `${thread.author.name}: ${thread.body}`,
  content: <CommentThread comment={thread} currentUser={VIEWER} />,
}));

const FEED_CLIPS = ['Bee on a flower', 'Second clip', 'Third clip'];

const styles = stylex.create({
  controlless: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 9',
    overflow: 'hidden',
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: 'black',
  },
  controllessVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  // Fades in while the player is hovered or holds keyboard focus.
  hoverLine: {
    position: 'absolute',
    insetInline: spacingVars['--spacing-2'],
    insetBlockEnd: spacingVars['--spacing-2'],
    pointerEvents: 'none',
    opacity: {
      default: 0,
      [stylex.when.ancestor(':hover')]: 1,
      [stylex.when.ancestor(':focus-within')]: 1,
    },
    transitionProperty: 'opacity',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
  },
  // A 3px line: thinner than ProgressBar's 8px track.
  line: {
    position: 'relative',
    height: 3,
    overflow: 'hidden',
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: 'oklch(1 0 0 / 0.35)',
  },
  lineFill: (fraction: number) => ({
    position: 'absolute',
    insetBlock: 0,
    insetInlineStart: 0,
    width: `${Math.min(Math.max(fraction, 0), 1) * 100}%`,
    backgroundColor: 'white',
  }),
  stepper: {
    position: 'absolute',
    insetInline: spacingVars['--spacing-2'],
    insetBlockStart: spacingVars['--spacing-2'],
    display: 'flex',
    gap: spacingVars['--spacing-1'],
  },
  step: {
    flexGrow: 1,
    flexBasis: 0,
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
    insetBlockStart: spacingVars['--spacing-4'],
    insetInlineEnd: spacingVars['--spacing-2'],
    backgroundColor: 'oklch(0 0 0 / 0.45)',
    borderRadius: radiusVars['--radius-full'],
  },
});

function ProgressLine({fraction}: {fraction: number}) {
  return (
    <div {...stylex.props(styles.line)}>
      <div {...stylex.props(styles.lineFill(fraction))} />
    </div>
  );
}

/** The only chrome of a controlless player: a progress line on hover. */
function HoverProgress() {
  const {state} = useMediaPlayer();
  const time = useMediaPlaybackTime();
  return (
    <div aria-hidden {...stylex.props(styles.hoverLine)}>
      <ProgressLine fraction={state.duration > 0 ? time / state.duration : 0} />
    </div>
  );
}

/** One segment per clip, like stories: done, playing, then still to come. */
function FeedStepper({count, index}: {count: number; index: number}) {
  const {state} = useMediaPlayer();
  const time = useMediaPlaybackTime();
  const playing = state.duration > 0 ? time / state.duration : 0;
  return (
    <div aria-hidden {...stylex.props(styles.stepper)}>
      {Array.from({length: count}, (_, step) => (
        <div key={step} {...stylex.props(styles.step)}>
          <ProgressLine
            fraction={step < index ? 1 : step === index ? playing : 0}
          />
        </div>
      ))}
    </div>
  );
}

function FeedStories() {
  const [index, setIndex] = useState(0);
  return (
    <MediaPlayer
      key={index}
      label={FEED_CLIPS[index] ?? 'Clip'}
      onEnded={() => setIndex(current => (current + 1) % FEED_CLIPS.length)}
      xstyle={styles.feed}>
      <MediaPlayerElement
        kind="video"
        src={VIDEO_SRC}
        autoPlay
        muted
        playsInline
        xstyle={styles.feedVideo}
      />
      <FeedStepper count={FEED_CLIPS.length} index={index} />
      {/* Controls over the video take the dark media colors. */}
      <MediaTheme mode="dark">
        <MediaVolume hasSlider={false} xstyle={styles.feedMute} />
      </MediaTheme>
    </MediaPlayer>
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
      <MediaPlayerElement kind="audio" src={AUDIO_SRC} />
      <HStack gap={2} vAlign="center">
        <MediaPlayButton />
        <MediaTimeSlider />
        <MediaTime display="remaining" />
        <ElapsedPercent />
        <MediaPlaybackRate variant="menu" />
        <MediaVolume />
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
 * previews its comment; pressing a marker jumps to it and opens its comment
 * thread. The timeline speaks the comment when its value reaches the marker.
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
 * A video with no controls: it plays muted on a loop, and hovering it or
 * giving it keyboard focus shows only a 3px progress line.
 */
export const ProgressTicker: Story = {
  render: () => (
    <div {...stylex.props(stylex.defaultMarker())}>
      <MediaPlayer label="Bee on a flower" xstyle={styles.controlless}>
        <MediaPlayerElement
          kind="video"
          src={VIDEO_SRC}
          autoPlay
          muted
          loop
          playsInline
          xstyle={styles.controllessVideo}
        />
        <HoverProgress />
      </MediaPlayer>
    </div>
  ),
};

/**
 * Feed clips with no control bar, like stories: each clip plays muted, and
 * a thin segment per clip shows which ones are done, the progress of the one
 * playing, and how many are left.
 */
export const FeedClip: Story = {
  render: () => <FeedStories />,
};
