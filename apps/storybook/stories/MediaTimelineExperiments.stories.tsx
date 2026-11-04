// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input VideoPlayer, the MediaPlayer parts, ProgressBar, and CommentPin
 * @output Storybook experiments that use ProgressBar as the timeline visual
 * @position Lab media player review stories; not a shipped API
 */

import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {useEffect, useRef, useState, type RefObject} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {ProgressBar} from '@astryxdesign/core/ProgressBar';
import {Text} from '@astryxdesign/core/Text';
import {
  colorVars,
  durationVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {
  CommentPin,
  MediaMuteButton,
  MediaPlayer,
  MediaPlayerVideo,
  VideoPlayer,
  useMediaPlayer,
} from '@astryxdesign/lab';

// CC0 sample media.
const VIDEO_SRC =
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm';

const CHAPTERS = [
  {start: 0, title: 'Arrival'},
  {start: 1.6, title: 'Pollen'},
  {start: 3.4, title: 'Take-off'},
];

const COMMENTS = [
  {id: 'c1', time: 0.8, author: 'Ana Ruiz', text: 'Love the light here.'},
  {id: 'c2', time: 2.2, author: 'Lin Park', text: 'Can we hold on this?'},
  {id: 'c3', time: 3.9, author: 'Mira Chen', text: 'Cut before the blur.'},
];

const styles = stylex.create({
  frame: {
    position: 'relative',
    width: '100%',
  },
  // Sits where the control bar sits: one bar inset from the edges.
  overlay: {
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
  overlayShown: {
    opacity: 1,
  },
  segments: {
    display: 'flex',
    gap: spacingVars['--spacing-1'],
    width: '100%',
  },
  segment: (grow: number) => ({
    flexGrow: grow,
    flexBasis: 0,
    minWidth: 0,
  }),
  chapterTitle: {
    color: 'white',
    textShadow: '0 1px 2px oklch(0 0 0 / 0.6)',
    marginBlockEnd: spacingVars['--spacing-1'],
  },
  lane: {
    position: 'relative',
    width: '100%',
    paddingBlockStart: spacingVars['--spacing-10'],
  },
  pin: (percent: number) => ({
    position: 'absolute',
    insetBlockStart: 0,
    insetInlineStart: `${percent}%`,
    transform: 'translateX(-50%)',
  }),
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
  comment: {
    color: colorVars['--color-text-secondary'],
  },
});

interface Playback {
  time: number;
  duration: number;
  isWaiting: boolean;
  isBarHidden: boolean;
}

/**
 * Reads a VideoPlayer's playback from outside it: the video element's clock
 * and the root's controls state. Only these experiments do this; a shipped
 * timeline part reads the player directly.
 */
function usePlaybackOf(frameRef: RefObject<HTMLDivElement | null>): Playback {
  const [playback, setPlayback] = useState<Playback>({
    time: 0,
    duration: 0,
    isWaiting: false,
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
        isWaiting:
          !video.paused && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA,
        isBarHidden: root.getAttribute('data-controls') === 'hidden',
      });
      frameId = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, [frameRef]);
  return playback;
}

function seekVideo(frameRef: RefObject<HTMLDivElement | null>, time: number) {
  const video = frameRef.current?.querySelector('video');
  if (video != null) {
    video.currentTime = time;
  }
}

function formatSeconds(seconds: number) {
  const whole = Math.floor(seconds);
  return `0:${String(whole).padStart(2, '0')}`;
}

function BarTicker({isBufferingShown}: {isBufferingShown: boolean}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const playback = usePlaybackOf(frameRef);
  const isBuffering = isBufferingShown || playback.isWaiting;
  return (
    <div ref={frameRef} {...stylex.props(styles.frame)}>
      <VideoPlayer src={VIDEO_SRC} label="Bee on a flower" isLooping />
      {/* The time slider already reports progress, so the ticker is hidden
          from assistive technology. */}
      <div
        aria-hidden
        {...stylex.props(
          styles.overlay,
          playback.isBarHidden && styles.overlayShown,
        )}>
        <ProgressBar
          label="Playback progress"
          isLabelHidden
          isIndeterminate={isBuffering}
          value={playback.time}
          max={playback.duration || 1}
        />
      </div>
    </div>
  );
}

function ChapterTicker() {
  const frameRef = useRef<HTMLDivElement>(null);
  const playback = usePlaybackOf(frameRef);
  const duration = playback.duration || 5;
  const chapters = CHAPTERS.map((chapter, index) => {
    const end = CHAPTERS[index + 1]?.start ?? duration;
    return {...chapter, end, length: end - chapter.start};
  });
  const current = chapters.reduce(
    (latest, chapter) => (playback.time >= chapter.start ? chapter : latest),
    chapters[0],
  );
  const segments = (
    <div {...stylex.props(styles.segments)}>
      {chapters.map(chapter => (
        <div
          key={chapter.title}
          {...stylex.props(styles.segment(chapter.length))}>
          <ProgressBar
            label={chapter.title}
            isLabelHidden
            value={Math.min(
              Math.max(playback.time - chapter.start, 0),
              chapter.length,
            )}
            max={chapter.length}
          />
        </div>
      ))}
    </div>
  );
  return (
    <VStack gap={3}>
      <div ref={frameRef} {...stylex.props(styles.frame)}>
        <VideoPlayer src={VIDEO_SRC} label="Bee on a flower" isLooping />
        <div
          aria-hidden
          {...stylex.props(
            styles.overlay,
            playback.isBarHidden && styles.overlayShown,
          )}>
          <Text type="supporting" xstyle={styles.chapterTitle}>
            {current?.title}
          </Text>
          {segments}
        </div>
      </div>
      <VStack gap={2}>
        <Text type="supporting" color="secondary">
          Chapter strip, always visible
        </Text>
        {segments}
        <HStack gap={1}>
          {chapters.map(chapter => (
            <Button
              key={chapter.title}
              label={`${chapter.title} ${formatSeconds(chapter.start)}`}
              variant={chapter === current ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => seekVideo(frameRef, chapter.start)}
            />
          ))}
        </HStack>
      </VStack>
    </VStack>
  );
}

function CommentLane() {
  const frameRef = useRef<HTMLDivElement>(null);
  const playback = usePlaybackOf(frameRef);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const duration = playback.duration || 5;
  const selected = COMMENTS.find(comment => comment.id === selectedId);
  return (
    <VStack gap={3}>
      <div ref={frameRef} {...stylex.props(styles.frame)}>
        <VideoPlayer src={VIDEO_SRC} label="Bee on a flower" />
      </div>
      <div dir="ltr" {...stylex.props(styles.lane)}>
        {COMMENTS.map(comment => (
          <CommentPin
            key={comment.id}
            size="sm"
            label={`Comment from ${comment.author} at ${formatSeconds(comment.time)}: ${comment.text}`}
            participants={[{id: comment.author, name: comment.author}]}
            isSelected={comment.id === selectedId}
            onClick={() => {
              setSelectedId(comment.id);
              seekVideo(frameRef, comment.time);
            }}
            xstyle={styles.pin((comment.time / duration) * 100)}
          />
        ))}
        <ProgressBar
          label="Playback progress"
          isLabelHidden
          value={playback.time}
          max={duration}
          marks={COMMENTS.map(comment => ({
            value: comment.time,
            label: `${comment.author}, ${formatSeconds(comment.time)}: ${comment.text}`,
          }))}
        />
      </div>
      <Text type="supporting" xstyle={styles.comment}>
        {selected != null
          ? `${selected.author} · ${formatSeconds(selected.time)} — ${selected.text}`
          : 'Pick a pin to jump to its comment.'}
      </Text>
    </VStack>
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

function FeedClip() {
  return (
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
  );
}

const meta: Meta = {
  title: 'Lab/MediaPlayer/Timeline experiments',
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
};

export default meta;

type Story = StoryObj;

/**
 * A ProgressBar ticker takes the bar's place while the controls hide, like
 * a thin progress line. Play the video and wait two seconds.
 */
export const TickerWhenBarHides: Story = {
  render: () => <BarTicker isBufferingShown={false} />,
};

/**
 * While started playback waits for data, the ticker turns indeterminate
 * instead of showing a spinner over the picture. This story holds the ticker
 * in that state: play the video and wait two seconds.
 */
export const TickerWhileBuffering: Story = {
  render: () => <BarTicker isBufferingShown />,
};

/**
 * One ProgressBar per chapter, sized by the chapter's length, with the
 * current chapter's title above the ticker. Below the player, the same
 * strip stays visible with buttons that jump to each chapter.
 */
export const ChapterSegments: Story = {
  render: () => <ChapterTicker />,
};

/**
 * Timestamped comments as CommentPins above a ProgressBar whose marks sit at
 * the same times. A pin jumps to its comment; a mark names it on hover and
 * focus.
 */
export const CommentPins: Story = {
  render: () => <CommentLane />,
};

/**
 * A feed clip with no control bar: it plays muted on a loop, and a
 * ProgressBar ticker is its only timeline.
 */
export const FeedClipTicker: Story = {
  render: () => <FeedClip />,
};
