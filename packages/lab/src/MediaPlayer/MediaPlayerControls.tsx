// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MediaPlayerControls.tsx
 * @input The nearest MediaPlayer's state and actions, plus per-part size,
 *   style, and DOM props
 * @output Exports the control parts: play, seek, volume, timeline, time,
 *   captions, fullscreen, and playback speed
 * @position Lab media parts; VideoPlayer and AudioPlayer arrange them, and
 *   custom layouts can arrange them inside any MediaPlayer
 */

import {
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {Button} from '@astryxdesign/core/Button';
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';
import {useContainerReveal} from '@astryxdesign/core/hooks';
import {IconButton, type IconButtonProps} from '@astryxdesign/core/IconButton';
import {Popover} from '@astryxdesign/core/Popover';
import {useLocale, useTranslator} from '@astryxdesign/core/i18n';
import {Slider} from '@astryxdesign/core/Slider';
import {Theme, ThemeContext} from '@astryxdesign/core/theme';
import {
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
  spacingVars,
  typeScaleVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {
  composeEventHandlers,
  focusOutlineProps,
  mergeProps,
  observeResize,
  themeProps,
} from '@astryxdesign/core/utils';
import {
  DEFAULT_PLAYBACK_RATES,
  formatClock,
  formatSpokenTime,
  useMediaPlaybackTime,
  useMediaPlayerContext,
  useMediaSelector,
} from './MediaPlayerContext';
import {useMediaIcon} from './mediaIcons';

/** Control height on the shared element-size scale: 28, 32, or 36px. */
export type MediaControlSize = 'sm' | 'md' | 'lg';

/** Props every button part takes. */
export interface MediaButtonPartProps extends Omit<
  BaseProps<HTMLButtonElement>,
  'children'
> {
  /** Control height. Follows the surrounding size, else `'md'`. */
  size?: MediaControlSize;
  /** Ref to the button element. */
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Diameter of the core Slider's thumb. The drawn timeline maps time through
 * the same inset, so the drawn thumb sits under the real one.
 */
const SLIDER_THUMB_SIZE = 20;
/** Height of the drawn track, the same as the core Slider's track. */
const TIMELINE_TRACK_SIZE = 4;
/** Width of the gap between two chapters on the track. */
const CHAPTER_GAP = 2;
/** Diameter of a marker dot. */
const TIMELINE_MARKER_SIZE = 6;
/** How near, in pixels, the pointer or the value must be to name a marker. */
const MARKER_REACH = 6;
/** Pointer target of a marker that opens a popover. */
const MARKER_HIT_SIZE = 24;
/** Width of a marker's popover, which fits a comment thread. */
const MARKER_POPOVER_WIDTH = 360;
/** Width of the volume slider that opens beside Mute. */
const VOLUME_SLIDER_WIDTH = 72;
/** Width of the speed slider that opens beside the speed button. */
const RATE_SLIDER_WIDTH = 88;

const styles = stylex.create({
  timeline: {
    position: 'relative',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  // The drawn timeline sits under the slider. The slider keeps the
  // interaction, the focus ring, and the hover and pressed tints; this layer
  // paints the track, the buffered range, the chapters, the played range,
  // the markers, and the thumb.
  timelineLayer: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  timelineLayerDisabled: {
    opacity: 0.5,
  },
  // Clears the slider's own track, fill, and thumb paint. The layer above
  // is its sibling, so it keeps the theme's colors.
  sliderPaintless: {
    display: 'contents',
    '--color-track': 'transparent',
    '--color-accent': 'transparent',
  },
  segment: (start: number, width: number) => ({
    position: 'absolute',
    top: '50%',
    insetInlineStart: start,
    width,
    height: TIMELINE_TRACK_SIZE,
    transform: 'translateY(-50%)',
    overflow: 'hidden',
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: colorVars['--color-track'],
  }),
  buffered: (width: number) => ({
    position: 'absolute',
    insetBlock: 0,
    insetInlineStart: 0,
    width,
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-accent']} 40%, transparent)`,
  }),
  played: (width: number) => ({
    position: 'absolute',
    insetBlock: 0,
    insetInlineStart: 0,
    width,
    backgroundColor: colorVars['--color-accent'],
  }),
  marker: (x: number) => ({
    position: 'absolute',
    top: '50%',
    insetInlineStart: x,
    width: TIMELINE_MARKER_SIZE,
    height: TIMELINE_MARKER_SIZE,
    transform: 'translate(-50%, -50%)',
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: colorVars['--color-text-primary'],
    boxShadow: `0 0 0 2px ${colorVars['--color-background-surface']}`,
  }),
  markerButtons: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  // Flex layout keeps the popover's trigger wrapper out of a line box, so no
  // line-height space pushes the dot off the track's center.
  markerAnchor: (x: number) => ({
    position: 'absolute',
    top: '50%',
    insetInlineStart: x,
    display: 'flex',
    transform: 'translate(-50%, -50%)',
    // A surface that hides the timeline, such as the video control bar,
    // sets this to none, so a hidden marker never catches a click.
    pointerEvents: 'var(--_media-controls-pointer-events, auto)',
    // The popover below renders in the page's theme; the dot keeps the
    // colors of the surface the timeline sits on.
    '--_media-marker-fill': colorVars['--color-text-primary'],
    '--_media-marker-ring': colorVars['--color-background-surface'],
  }),
  markerButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: MARKER_HIT_SIZE,
    height: MARKER_HIT_SIZE,
    padding: 0,
    borderWidth: 0,
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: 'transparent',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  markerDot: {
    width: TIMELINE_MARKER_SIZE,
    height: TIMELINE_MARKER_SIZE,
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: 'var(--_media-marker-fill)',
    boxShadow: '0 0 0 2px var(--_media-marker-ring)',
  },
  thumb: (x: number) => ({
    position: 'absolute',
    top: '50%',
    insetInlineStart: x,
    width: SLIDER_THUMB_SIZE,
    height: SLIDER_THUMB_SIZE,
    transform: 'translate(-50%, -50%)',
    borderRadius: radiusVars['--radius-full'],
    backgroundColor: colorVars['--color-accent'],
  }),
  preview: (x: number) => ({
    position: 'absolute',
    insetInlineStart: x,
    bottom: `calc(100% + ${spacingVars['--spacing-2']})`,
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
    maxWidth: 240,
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-text-primary'],
    color: colorVars['--color-background-surface'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    textAlign: 'center',
    whiteSpace: 'nowrap',
  }),
  previewTime: {
    fontVariantNumeric: 'tabular-nums',
  },
  // Fits the widest speed label, such as "1.75×", so the control keeps its
  // width when the speed changes.
  rateLabel: {
    minWidth: `calc(4.5ch + ${spacingVars['--spacing-3']} * 2)`,
    fontVariantNumeric: 'tabular-nums',
  },
  previewLine: {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // A button with a slider that opens beside it. The slider's column opens
  // while the button is hovered or holds focus, and stays open on touch, in
  // step with the container reveal.
  revealGroup: {
    display: 'grid',
    alignItems: 'center',
    // In a flex row the timeline gives up the space, so the open slider is
    // never cut.
    flexShrink: 0,
    transitionProperty: 'grid-template-columns',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  revealNone: {
    gridTemplateColumns: 'auto',
  },
  // The slider opens before the button. While the column animates, the
  // tracks hug the end, so the button holds still under the pointer.
  revealBefore: {
    justifyContent: 'end',
    gridTemplateColumns: {
      default: '0fr auto',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': '1fr auto',
      },
      ':focus-within': '1fr auto',
      '@media (any-pointer: coarse)': '1fr auto',
    },
  },
  // The slider opens after the button; the tracks hug the start.
  revealAfter: {
    justifyContent: 'start',
    gridTemplateColumns: {
      default: 'auto 0fr',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': 'auto 1fr',
      },
      ':focus-within': 'auto 1fr',
      '@media (any-pointer: coarse)': 'auto 1fr',
    },
  },
  revealSlot: {
    minWidth: 0,
    overflow: 'clip',
    overflowClipMargin: spacingVars['--spacing-1'],
    // A narrow player keeps the button and drops the slider.
    display: {
      default: 'block',
      '@container (max-width: 480px)': 'none',
    },
  },
  // The gap sits inside the opening column, so it closes with the slider.
  sliderGapBefore: {
    paddingInlineEnd: spacingVars['--spacing-2'],
  },
  sliderGapAfter: {
    paddingInlineStart: spacingVars['--spacing-2'],
  },
  time: {
    flexShrink: 0,
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontVariantNumeric: 'tabular-nums',
    color: colorVars['--color-text-primary'],
    whiteSpace: 'nowrap',
  },
});

export interface MediaPlayButtonProps extends MediaButtonPartProps {
  /** Button emphasis. Defaults to `'ghost'`. */
  variant?: IconButtonProps['variant'];
}

/**
 * Plays and pauses the media. After the end it replays from the start.
 *
 * @example
 * ```
 * <MediaPlayer label="Episode 12">
 *   <MediaPlayerAudio src="/media/episode-12.mp3" />
 *   <MediaPlayButton variant="primary" />
 * </MediaPlayer>
 * ```
 */
export function MediaPlayButton({
  size,
  variant = 'ghost',
  onClick,
  xstyle,
  className,
  style,
  ...rest
}: MediaPlayButtonProps) {
  const {store} = useMediaPlayerContext('MediaPlayButton');
  const isPaused = useMediaSelector('MediaPlayButton', state => state.isPaused);
  const isEnded = useMediaSelector('MediaPlayButton', state => state.isEnded);
  const t = useTranslator();
  const label = isEnded
    ? t('@astryx.mediaPlayer.replay')
    : isPaused
      ? t('@astryx.mediaPlayer.play')
      : t('@astryx.mediaPlayer.pause');
  const icon = useMediaIcon(isEnded ? 'replay' : isPaused ? 'play' : 'pause');
  return (
    <IconButton
      {...rest}
      label={label}
      tooltip={label}
      icon={icon}
      variant={variant}
      size={size}
      onClick={composeEventHandlers(onClick, () =>
        store.actions.togglePaused(),
      )}
      {...mergeProps(themeProps('media-play-button'), {className, style})}
      xstyle={xstyle}
    />
  );
}

MediaPlayButton.displayName = 'MediaPlayButton';

export interface MediaSeekButtonProps extends MediaButtonPartProps {
  /** Seconds to move: negative skips back, positive skips forward. */
  offset: number;
}

/**
 * Skips back or forward by a fixed number of seconds. It is disabled until
 * the media reports its duration.
 *
 * @example
 * ```
 * <MediaSeekButton offset={-15} />
 * <MediaSeekButton offset={30} />
 * ```
 */
export function MediaSeekButton({
  offset,
  size,
  onClick,
  xstyle,
  className,
  style,
  ...rest
}: MediaSeekButtonProps) {
  const {store} = useMediaPlayerContext('MediaSeekButton');
  const duration = useMediaSelector('MediaSeekButton', state => state.duration);
  const t = useTranslator();
  const seconds = Math.abs(Math.round(offset));
  const label =
    offset < 0
      ? t('@astryx.mediaPlayer.skipBack', {seconds})
      : t('@astryx.mediaPlayer.skipForward', {seconds});
  const icon = useMediaIcon(offset < 0 ? 'skipBack' : 'skipForward');
  return (
    <IconButton
      {...rest}
      label={label}
      tooltip={label}
      icon={icon}
      variant="ghost"
      size={size}
      isDisabled={!(Number.isFinite(duration) && duration > 0)}
      onClick={composeEventHandlers(onClick, () =>
        store.actions.seekBy(offset),
      )}
      {...mergeProps(themeProps('media-seek-button'), {className, style})}
      xstyle={xstyle}
    />
  );
}

MediaSeekButton.displayName = 'MediaSeekButton';

/** Mutes and unmutes the media. Its icon follows the volume. */
function MuteButton({size}: {size?: MediaControlSize}) {
  const {store} = useMediaPlayerContext('MediaVolume');
  const isMuted = useMediaSelector('MediaVolume', state => state.isMuted);
  const volume = useMediaSelector('MediaVolume', state => state.volume);
  const t = useTranslator();
  const isSilent = isMuted || volume === 0;
  const label = isSilent
    ? t('@astryx.mediaPlayer.unmute')
    : t('@astryx.mediaPlayer.mute');
  const icon = useMediaIcon(
    isSilent ? 'volumeOff' : volume < 0.5 ? 'volumeLow' : 'volumeHigh',
  );
  return (
    <IconButton
      label={label}
      tooltip={label}
      icon={icon}
      variant="ghost"
      size={size}
      onClick={() => store.actions.toggleMuted()}
      {...themeProps('media-volume-button')}
    />
  );
}

/** Sets the volume and shows it as a percentage in a tooltip. */
function VolumeSlider({xstyle}: {xstyle: StyleXStyles}) {
  const {store} = useMediaPlayerContext('MediaVolume');
  const volume = useMediaSelector('MediaVolume', state =>
    state.isMuted ? 0 : state.volume,
  );
  const t = useTranslator();
  const locale = useLocale();
  const percent = useMemo(
    () => new Intl.NumberFormat(locale, {style: 'percent'}),
    [locale],
  );
  return (
    <Slider
      label={t('@astryx.mediaPlayer.volume')}
      isLabelHidden
      min={0}
      max={100}
      step={1}
      value={Math.round(volume * 100)}
      valueDisplay="tooltip"
      formatValue={value => percent.format(value / 100)}
      onChange={(value: number) => store.actions.setVolume(value / 100)}
      width={VOLUME_SLIDER_WIDTH}
      containerClassName={themeProps('media-volume-slider').className}
      containerXstyle={xstyle}
    />
  );
}

/** Which side of its button a revealed slider opens on. */
export type MediaSliderPlacement = 'start' | 'end';

/**
 * The props of a control that reveals a slider beside its button, and the
 * reveal's container and slot props.
 */
function useSliderReveal(hasSlider: boolean, placement: MediaSliderPlacement) {
  const reveal = useContainerReveal();
  const isBefore = placement === 'start';
  return {
    isBefore,
    groupProps: (xstyle: StyleXStyles | undefined) =>
      mergeProps(
        hasSlider ? reveal.getContainerProps() : {},
        stylex.props(
          styles.revealGroup,
          !hasSlider
            ? styles.revealNone
            : isBefore
              ? styles.revealBefore
              : styles.revealAfter,
          xstyle,
        ),
      ),
    slotProps: () =>
      mergeProps(
        reveal.getContentRevealProps({isLayoutPreserved: true}),
        stylex.props(styles.revealSlot),
      ),
    gap: isBefore ? styles.sliderGapBefore : styles.sliderGapAfter,
  };
}

export interface MediaVolumeProps extends Omit<
  BaseProps<HTMLDivElement>,
  'children'
> {
  /** Control height. Follows the surrounding size, else `'md'`. */
  size?: MediaControlSize;
  /**
   * Shows a volume slider beside Mute while Mute is hovered or holds focus,
   * and always on touch. Defaults to `true`. The slider never renders where
   * script cannot set the volume, such as iOS Safari.
   */
  hasSlider?: boolean;
  /**
   * The side of Mute the slider opens on, in a row that runs left to right.
   * Defaults to `'start'`, so Mute at the end of a row stays under the
   * pointer while the slider opens.
   */
  sliderPlacement?: MediaSliderPlacement;
  /** Ref to the group element. */
  ref?: Ref<HTMLDivElement>;
}

/**
 * Mute and volume. Mute switches the sound off and on, and its icon follows
 * the volume. The volume slider opens beside Mute while Mute is hovered or
 * holds focus, stays open on touch, and shows the volume in a tooltip. In a
 * container narrower than 480px the slider stays closed.
 *
 * @example
 * ```
 * <HStack gap={2} vAlign="center">
 *   <MediaPlayButton />
 *   <MediaTimeSlider />
 *   <MediaVolume />
 * </HStack>
 * ```
 */
export function MediaVolume({
  size,
  hasSlider = true,
  sliderPlacement = 'start',
  xstyle,
  className,
  style,
  ...rest
}: MediaVolumeProps) {
  const canSetVolume = useMediaSelector(
    'MediaVolume',
    state => state.canSetVolume,
  );
  const showsSlider = hasSlider && canSetVolume;
  const reveal = useSliderReveal(showsSlider, sliderPlacement);
  const slider = showsSlider ? (
    <span {...reveal.slotProps()}>
      <VolumeSlider xstyle={reveal.gap} />
    </span>
  ) : null;
  return (
    <div
      {...rest}
      {...mergeProps(
        mergeProps(themeProps('media-volume'), reveal.groupProps(xstyle)),
        {className, style},
      )}>
      {reveal.isBefore ? slider : null}
      <MuteButton size={size} />
      {reveal.isBefore ? null : slider}
    </div>
  );
}

MediaVolume.displayName = 'MediaVolume';

/** A chapter of the media, shown as a segment of the timeline. */
export interface MediaTimelineChapter {
  /** Start of the chapter, in seconds. */
  start: number;
  /**
   * Title of the chapter. The pointer preview shows it, and the timeline
   * speaks it with the time.
   */
  title: string;
}

/** A point of interest on the timeline, such as a timestamped comment. */
export interface MediaTimelineMarker {
  /** Time of the marker, in seconds. */
  time: number;
  /**
   * Names the marker. The pointer preview shows it, and the timeline speaks
   * it when its value reaches the marker.
   */
  label: string;
  /**
   * Content of a popover that opens when the marker is pressed, such as a
   * CommentThread. A marker with content is a button that also jumps to its
   * time; a marker without it is a dot.
   */
  content?: ReactNode;
}

export interface MediaTimeSliderProps extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange' | 'children'
> {
  /** Chapters, drawn as segments of the track with a small gap between them. */
  chapters?: readonly MediaTimelineChapter[];
  /** Points of interest, such as timestamped comments, drawn as dots. */
  markers?: readonly MediaTimelineMarker[];
  /** Ref to the slider thumb. */
  ref?: Ref<HTMLDivElement>;
}

function findChapter(
  chapters: readonly MediaTimelineChapter[],
  time: number,
): MediaTimelineChapter | undefined {
  let found: MediaTimelineChapter | undefined;
  for (const chapter of chapters) {
    if (time >= chapter.start) {
      found = chapter;
    }
  }
  return found;
}

function findMarker(
  markers: readonly MediaTimelineMarker[],
  time: number,
  reach: number,
): MediaTimelineMarker | undefined {
  let found: MediaTimelineMarker | undefined;
  let nearest = reach;
  for (const marker of markers) {
    const distance = Math.abs(marker.time - time);
    if (distance <= nearest) {
      nearest = distance;
      found = marker;
    }
  }
  return found;
}

/**
 * A marker with content: a dot on the timeline that jumps to its time and
 * opens its content in a popover.
 */
function MarkerButton({
  marker,
  x,
  onPress,
  onOpenChange,
}: {
  marker: MediaTimelineMarker;
  x: number;
  onPress: () => void;
  onOpenChange: (isOpen: boolean) => void;
}) {
  // The popover shows page content, such as a comment thread, so it takes
  // the page's theme instead of the media surface's.
  const pageTheme = use(ThemeContext);
  const popover = (
    <Popover
      label={marker.label}
      content={marker.content}
      placement="above"
      alignment="center"
      width={MARKER_POPOVER_WIDTH}
      padding={0}
      onOpenChange={onOpenChange}>
      <button
        type="button"
        aria-label={marker.label}
        data-media-marker=""
        onClick={onPress}
        {...focusOutlineProps.focusVisible(styles.markerButton)}>
        <span aria-hidden {...stylex.props(styles.markerDot)} />
      </button>
    </Popover>
  );
  return (
    <div {...stylex.props(styles.markerAnchor(x))}>
      {pageTheme != null ? (
        <Theme theme={pageTheme.theme} mode={pageTheme.mode}>
          {popover}
        </Theme>
      ) : (
        popover
      )}
    </div>
  );
}

const TIMELINE_KEY_OFFSETS: Readonly<Record<string, number>> = {
  ArrowLeft: -5,
  ArrowDown: -5,
  ArrowRight: 5,
  ArrowUp: 5,
  PageDown: -10,
  PageUp: 10,
};

/**
 * The timeline. Dragging previews the time and seeks on release; arrow keys
 * skip 5 seconds and Page Up and Page Down skip 10. The timeline runs left
 * to right in every direction, because it shows the direction of the media,
 * not reading order. The track shows the buffered range, and optional
 * chapters and markers. A pointer over the timeline previews the time, the
 * chapter, and the nearest marker.
 *
 * @example
 * ```
 * <HStack gap={2} vAlign="center">
 *   <MediaPlayButton />
 *   <MediaTimeSlider />
 *   <MediaTime display="remaining" />
 * </HStack>
 * ```
 */
export function MediaTimeSlider({
  chapters,
  markers,
  xstyle,
  className,
  style,
  ...rest
}: MediaTimeSliderProps) {
  const {store, scrubTime, setScrubTime, holdControls, wakeControls} =
    useMediaPlayerContext('MediaTimeSlider');
  const duration = useMediaSelector('MediaTimeSlider', state => state.duration);
  const bufferedEnd = useMediaSelector(
    'MediaTimeSlider',
    state => state.bufferedEnd,
  );
  const t = useTranslator();
  const locale = useLocale();
  const isPointerDownRef = useRef(false);
  const pendingTimeRef = useRef<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [previewX, setPreviewX] = useState<number | null>(null);
  const isSeekable = Number.isFinite(duration) && duration > 0;
  const playbackTime = useMediaPlaybackTime();
  const value = isSeekable ? Math.min(scrubTime ?? playbackTime, duration) : 0;
  const sortedChapters = useMemo(
    () =>
      [...(chapters ?? [])]
        .filter(chapter => Number.isFinite(chapter.start))
        .sort((first, second) => first.start - second.start),
    [chapters],
  );
  const markerList = markers ?? [];

  // Syncs the drawn timeline with the width of the timeline element.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (wrapper == null) {
      return;
    }
    setWidth(wrapper.clientWidth);
    return observeResize(wrapper, () => setWidth(wrapper.clientWidth));
  }, []);

  const travel = Math.max(width - SLIDER_THUMB_SIZE, 0);
  const toX = (time: number) =>
    SLIDER_THUMB_SIZE / 2 +
    (isSeekable ? Math.min(Math.max(time / duration, 0), 1) : 0) * travel;
  const toTime = (x: number) =>
    isSeekable && travel > 0
      ? Math.min(Math.max((x - SLIDER_THUMB_SIZE / 2) / travel, 0), 1) *
        duration
      : 0;
  const markerReachSeconds =
    isSeekable && travel > 0 ? (MARKER_REACH / travel) * duration : 0;

  const edges = [
    0,
    ...(isSeekable
      ? sortedChapters
          .filter(chapter => chapter.start > 0 && chapter.start < duration)
          .map(chapter => toX(chapter.start))
      : []),
    width,
  ];
  const segments = edges.slice(0, -1).map((edge, index) => {
    const start = index === 0 ? edge : edge + CHAPTER_GAP / 2;
    const next = edges[index + 1] ?? width;
    const end = index === edges.length - 2 ? next : next - CHAPTER_GAP / 2;
    return {start, width: Math.max(end - start, 0)};
  });
  const playedX = toX(value);
  const bufferedX = bufferedEnd > 0 ? toX(bufferedEnd) : 0;

  const previewTime =
    previewX != null ? toTime(previewX) : scrubTime != null ? value : null;
  const previewAt = previewX ?? (scrubTime != null ? playedX : null);
  const previewChapter =
    previewTime != null ? findChapter(sortedChapters, previewTime) : undefined;
  const previewMarker =
    previewTime != null
      ? findMarker(markerList, previewTime, markerReachSeconds)
      : undefined;

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const wrapper = wrapperRef.current;
    if (event.pointerType === 'touch' || wrapper == null || !isSeekable) {
      return;
    }
    setPreviewX(event.clientX - wrapper.getBoundingClientRect().left);
  };

  const commit = () => {
    const time = pendingTimeRef.current;
    isPointerDownRef.current = false;
    pendingTimeRef.current = null;
    setScrubTime(null);
    holdControls('scrub', false);
    if (time != null) {
      store.actions.seek(time);
    }
  };

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    const offset = TIMELINE_KEY_OFFSETS[event.key];
    // Keys typed in a marker's popover, such as a comment reply, reach this
    // wrapper through the React tree. Only the slider's own keys seek.
    const isSliderKey =
      event.target instanceof Element &&
      event.target.getAttribute('role') === 'slider';
    if (
      offset == null ||
      !isSliderKey ||
      !isSeekable ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    store.actions.seekBy(offset);
    wakeControls();
  };

  // The wrapper keeps the timeline left to right and owns the drag and key
  // capture; the slider inside it carries the theme target.
  return (
    <div
      ref={wrapperRef}
      dir="ltr"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setPreviewX(null)}
      onKeyDownCapture={handleKeyDownCapture}
      onPointerDownCapture={() => {
        if (isSeekable) {
          isPointerDownRef.current = true;
          holdControls('scrub', true);
        }
      }}
      onPointerUpCapture={() => {
        if (isPointerDownRef.current) {
          commit();
        }
      }}
      onPointerCancelCapture={() => {
        if (isPointerDownRef.current) {
          commit();
        }
      }}
      {...stylex.props(styles.timeline)}>
      <div
        aria-hidden
        {...stylex.props(
          styles.timelineLayer,
          !isSeekable && styles.timelineLayerDisabled,
        )}>
        {segments.map(segment => (
          <div
            key={segment.start}
            {...stylex.props(styles.segment(segment.start, segment.width))}>
            <div
              {...stylex.props(
                styles.buffered(
                  Math.min(
                    Math.max(bufferedX - segment.start, 0),
                    segment.width,
                  ),
                ),
              )}
            />
            <div
              {...stylex.props(
                styles.played(
                  Math.min(Math.max(playedX - segment.start, 0), segment.width),
                ),
              )}
            />
          </div>
        ))}
        {isSeekable
          ? markerList
              .filter(marker => marker.content == null)
              .map(marker => (
                <div
                  key={`${marker.time}-${marker.label}`}
                  data-media-marker=""
                  {...stylex.props(styles.marker(toX(marker.time)))}
                />
              ))
          : null}
        <div {...stylex.props(styles.thumb(playedX))} />
        {previewTime != null && previewAt != null ? (
          <div {...stylex.props(styles.preview(previewAt))}>
            <span {...stylex.props(styles.previewTime)}>
              {formatClock(previewTime, duration >= 3600)}
            </span>
            {previewChapter != null ? (
              <span {...stylex.props(styles.previewLine)}>
                {previewChapter.title}
              </span>
            ) : null}
            {previewMarker != null ? (
              <span {...stylex.props(styles.previewLine)}>
                {previewMarker.label}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div {...stylex.props(styles.sliderPaintless)}>
        <Slider
          {...rest}
          label={t('@astryx.mediaPlayer.seek')}
          isLabelHidden
          min={0}
          max={isSeekable ? duration : 1}
          step={0.01}
          value={value}
          isDisabled={!isSeekable}
          valueDisplay="none"
          formatValue={time => {
            let spoken = t('@astryx.mediaPlayer.timeValue', {
              current: formatSpokenTime(time, locale),
              duration: formatSpokenTime(duration, locale),
            });
            const chapter = findChapter(sortedChapters, time);
            if (chapter != null) {
              spoken = t('@astryx.mediaPlayer.timeValueContext', {
                value: spoken,
                context: chapter.title,
              });
            }
            const marker = findMarker(markerList, time, markerReachSeconds);
            if (marker != null) {
              spoken = t('@astryx.mediaPlayer.timeValueContext', {
                value: spoken,
                context: marker.label,
              });
            }
            return spoken;
          }}
          onChange={(time: number) => {
            if (isPointerDownRef.current) {
              pendingTimeRef.current = time;
              setScrubTime(time);
            } else {
              store.actions.seek(time);
            }
          }}
          width="100%"
          containerClassName={[
            themeProps('media-time-slider').className,
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          containerStyle={style}
          containerXstyle={xstyle}
        />
      </div>
      {isSeekable && markerList.some(marker => marker.content != null) ? (
        <div {...stylex.props(styles.markerButtons)}>
          {markerList
            .filter(marker => marker.content != null)
            .map(marker => (
              <MarkerButton
                key={`${marker.time}-${marker.label}`}
                marker={marker}
                x={toX(marker.time)}
                onPress={() => store.actions.seek(marker.time)}
                onOpenChange={isOpen => holdControls('menu', isOpen)}
              />
            ))}
        </div>
      ) : null}
    </div>
  );
}

MediaTimeSlider.displayName = 'MediaTimeSlider';

export interface MediaTimeProps extends Omit<
  BaseProps<HTMLSpanElement>,
  'children'
> {
  /**
   * What to show: the current time, the duration, the time left, or the
   * current time and the duration. Defaults to `'current-duration'`.
   */
  display?: 'current' | 'duration' | 'remaining' | 'current-duration';
  /** Ref to the text element. */
  ref?: Ref<HTMLSpanElement>;
}

/**
 * Shows playback time. A live stream shows "Live" instead. The text reads left
 * to right in every direction.
 *
 * @example
 * ```
 * <MediaTime display="current-duration" />
 * ```
 */
export function MediaTime({
  display = 'current-duration',
  xstyle,
  className,
  style,
  ...rest
}: MediaTimeProps) {
  const {scrubTime} = useMediaPlayerContext('MediaTime');
  const currentTime = useMediaSelector('MediaTime', state => state.currentTime);
  const duration = useMediaSelector('MediaTime', state => state.duration);
  const t = useTranslator();
  const time = scrubTime ?? currentTime;
  const hasHours = Number.isFinite(duration) && duration >= 3600;
  let text: string;
  if (duration === Infinity) {
    text = t('@astryx.mediaPlayer.live');
  } else if (display === 'current') {
    text = formatClock(time, hasHours);
  } else if (display === 'duration') {
    text = formatClock(duration, hasHours);
  } else if (display === 'remaining') {
    text = `-${formatClock(Math.max(duration - time, 0), hasHours)}`;
  } else {
    text = `${formatClock(time, hasHours)} / ${formatClock(duration, hasHours)}`;
  }
  // Times read left to right in every direction, like the timeline.
  return (
    <span
      {...rest}
      dir="ltr"
      {...mergeProps(
        themeProps('media-time', {display}),
        stylex.props(styles.time, xstyle),
        className,
        style,
      )}>
      {text}
    </span>
  );
}

MediaTime.displayName = 'MediaTime';

/**
 * Turns captions on and off. It renders nothing when the media has no
 * caption or subtitle track.
 *
 * @example
 * ```
 * <MediaCaptionsButton />
 * ```
 */
export function MediaCaptionsButton({
  size,
  xstyle,
  className,
  style,
  ...rest
}: MediaButtonPartProps) {
  const {store} = useMediaPlayerContext('MediaCaptionsButton');
  const hasTracks = useMediaSelector(
    'MediaCaptionsButton',
    state => state.textTracks.length > 0,
  );
  const isOn = useMediaSelector(
    'MediaCaptionsButton',
    state => state.activeTextTrackId != null,
  );
  const t = useTranslator();
  const icon = useMediaIcon('captions');
  if (!hasTracks) {
    return null;
  }
  const label = t('@astryx.mediaPlayer.captions');
  return (
    <ToggleButton
      {...rest}
      label={label}
      tooltip={label}
      icon={icon}
      isIconOnly
      isPressed={isOn}
      size={size}
      onPressedChange={() => store.actions.toggleCaptions()}
      {...mergeProps(themeProps('media-captions-button'), {className, style})}
      xstyle={xstyle}
    />
  );
}

MediaCaptionsButton.displayName = 'MediaCaptionsButton';

/**
 * Enters and exits fullscreen. The player's own element goes fullscreen, so
 * the controls come along. iPhone shows the system player instead. It
 * renders nothing where fullscreen is not available.
 *
 * @example
 * ```
 * <MediaFullscreenButton />
 * ```
 */
export function MediaFullscreenButton({
  size,
  onClick,
  xstyle,
  className,
  style,
  ...rest
}: MediaButtonPartProps) {
  const {store} = useMediaPlayerContext('MediaFullscreenButton');
  const canFullscreen = useMediaSelector(
    'MediaFullscreenButton',
    state => state.canFullscreen,
  );
  const isFullscreen = useMediaSelector(
    'MediaFullscreenButton',
    state => state.isFullscreen,
  );
  const t = useTranslator();
  const icon = useMediaIcon(
    isFullscreen ? 'fullscreenExit' : 'fullscreenEnter',
  );
  if (!canFullscreen) {
    return null;
  }
  const label = isFullscreen
    ? t('@astryx.mediaPlayer.exitFullscreen')
    : t('@astryx.mediaPlayer.enterFullscreen');
  return (
    <IconButton
      {...rest}
      label={label}
      tooltip={label}
      icon={icon}
      variant="ghost"
      size={size}
      onClick={composeEventHandlers(onClick, () =>
        store.actions.toggleFullscreen(),
      )}
      {...mergeProps(themeProps('media-fullscreen-button'), {className, style})}
      xstyle={xstyle}
    />
  );
}

MediaFullscreenButton.displayName = 'MediaFullscreenButton';

/** Formats a playback speed as a short label, such as "1.5×". */
function useRateLabel() {
  const t = useTranslator();
  const locale = useLocale();
  const numberFormat = useMemo(
    () => new Intl.NumberFormat(locale, {maximumFractionDigits: 2}),
    [locale],
  );
  return {
    label: (rate: number) =>
      t('@astryx.mediaPlayer.playbackRate', {rate: numberFormat.format(rate)}),
    name: (rate: number) =>
      t('@astryx.mediaPlayer.playbackSpeedValue', {
        rate: numberFormat.format(rate),
      }),
    tooltip: t('@astryx.mediaPlayer.playbackSpeed'),
  };
}

/**
 * Shows the playback speed. A press switches between normal speed and the
 * last other speed, the way Mute switches the sound off and on. From normal
 * speed with no other speed yet, it steps up one speed.
 */
function RateToggleButton({
  rates,
  size,
}: {
  rates: readonly number[];
  size?: MediaControlSize;
}) {
  const {store} = useMediaPlayerContext('MediaPlaybackRate');
  const rate = useMediaSelector(
    'MediaPlaybackRate',
    state => state.playbackRate,
  );
  const lastRateRef = useRef<number | null>(null);
  const text = useRateLabel();
  const handleClick = () => {
    const current = store.getState().playbackRate;
    if (current !== 1) {
      lastRateRef.current = current;
      store.actions.setPlaybackRate(1);
      return;
    }
    store.actions.setPlaybackRate(
      lastRateRef.current ?? rates.find(option => option > 1) ?? 1,
    );
  };
  return (
    <Button
      label={text.label(rate)}
      aria-label={text.name(rate)}
      tooltip={text.tooltip}
      variant="ghost"
      size={size}
      onClick={handleClick}
      {...themeProps('media-playback-rate-button')}
      xstyle={styles.rateLabel}
    />
  );
}

/** Sets the playback speed in steps and shows it in a tooltip. */
function RateSlider({
  rates,
  xstyle,
}: {
  rates: readonly number[];
  xstyle: StyleXStyles;
}) {
  const {store} = useMediaPlayerContext('MediaPlaybackRate');
  const rate = useMediaSelector(
    'MediaPlaybackRate',
    state => state.playbackRate,
  );
  const t = useTranslator();
  const text = useRateLabel();
  // The nearest listed speed, so a speed set elsewhere still places the thumb.
  const index = rates.reduce(
    (best, option, candidate) =>
      Math.abs(option - rate) < Math.abs((rates[best] ?? 1) - rate)
        ? candidate
        : best,
    0,
  );
  return (
    <Slider
      label={t('@astryx.mediaPlayer.playbackSpeed')}
      isLabelHidden
      min={0}
      max={Math.max(rates.length - 1, 1)}
      step={1}
      value={index}
      valueDisplay="tooltip"
      formatValue={value => text.label(rates[value] ?? 1)}
      onChange={(value: number) =>
        store.actions.setPlaybackRate(rates[value] ?? 1)
      }
      width={RATE_SLIDER_WIDTH}
      containerClassName={themeProps('media-playback-rate-slider').className}
      containerXstyle={xstyle}
    />
  );
}

/**
 * Shows the playback speed and opens a menu of speeds, with the current one
 * checked. The menu keeps the controls visible while it is open.
 */
function RateMenu({
  rates,
  size,
}: {
  rates: readonly number[];
  size?: MediaControlSize;
}) {
  const {store, holdControls} = useMediaPlayerContext('MediaPlaybackRate');
  const rate = useMediaSelector(
    'MediaPlaybackRate',
    state => state.playbackRate,
  );
  const text = useRateLabel();
  return (
    <DropdownMenu
      button={{
        label: text.label(rate),
        'aria-label': text.name(rate),
        tooltip: text.tooltip,
        variant: 'ghost',
        size,
        xstyle: styles.rateLabel,
        ...themeProps('media-playback-rate-button'),
      }}
      onOpenChange={isOpen => holdControls('menu', isOpen)}>
      <DropdownMenuRadioGroup
        label={text.tooltip}
        value={String(rate)}
        onChange={value => store.actions.setPlaybackRate(Number(value))}>
        {rates.map(option => (
          <DropdownMenuRadioItem
            key={option}
            value={String(option)}
            label={text.label(option)}
          />
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenu>
  );
}

export interface MediaPlaybackRateProps extends Omit<
  BaseProps<HTMLDivElement>,
  'children'
> {
  /**
   * How the speed changes. `'slider'`: a button that switches between normal
   * speed and the last other speed, with a slider of speeds beside it while
   * it is hovered or holds focus, and always on touch. `'menu'`: a button
   * that opens a menu of speeds, with the current one checked. Defaults to
   * `'slider'`.
   */
  variant?: 'slider' | 'menu';
  /**
   * Speeds offered, in order. Defaults to 0.5, 0.75, 1, 1.25, 1.5, 1.75, and
   * 2, the same speeds the `<` and `>` shortcuts step through.
   */
  rates?: readonly number[];
  /** Control height. Follows the surrounding size, else `'md'`. */
  size?: MediaControlSize;
  /**
   * For the slider variant, the side of the button the slider opens on, in a
   * row that runs left to right. Defaults to `'end'`, so a button at the
   * start of a row stays under the pointer while the slider opens.
   */
  sliderPlacement?: MediaSliderPlacement;
  /** Ref to the group element. */
  ref?: Ref<HTMLDivElement>;
}

/**
 * Playback speed. The button names the current speed and keeps one width at
 * every speed. The slider variant switches between normal speed and the last
 * other speed, and opens a slider of speeds beside the button; the menu
 * variant opens a menu of speeds. In a container narrower than 480px the
 * slider stays closed.
 *
 * @example
 * ```
 * <MediaPlaybackRate />
 * <MediaPlaybackRate variant="menu" rates={[0.75, 1, 1.25, 1.5, 2]} />
 * ```
 */
export function MediaPlaybackRate({
  variant = 'slider',
  rates = DEFAULT_PLAYBACK_RATES,
  size,
  sliderPlacement = 'end',
  xstyle,
  className,
  style,
  ...rest
}: MediaPlaybackRateProps) {
  const hasSlider = variant === 'slider';
  const reveal = useSliderReveal(hasSlider, sliderPlacement);
  const slider = hasSlider ? (
    <span {...reveal.slotProps()}>
      <RateSlider rates={rates} xstyle={reveal.gap} />
    </span>
  ) : null;
  return (
    <div
      {...rest}
      {...mergeProps(
        mergeProps(
          themeProps('media-playback-rate', {variant}),
          reveal.groupProps(xstyle),
        ),
        {className, style},
      )}>
      {reveal.isBefore ? slider : null}
      {hasSlider ? (
        <RateToggleButton rates={rates} size={size} />
      ) : (
        <RateMenu rates={rates} size={size} />
      )}
      {reveal.isBefore ? null : slider}
    </div>
  );
}

MediaPlaybackRate.displayName = 'MediaPlaybackRate';
