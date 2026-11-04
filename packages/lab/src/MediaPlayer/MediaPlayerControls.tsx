// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MediaPlayerControls.tsx
 * @input The nearest MediaPlayer's state and actions, plus per-part size,
 *   style, and DOM props
 * @output Exports the control parts: play, seek, mute, volume, timeline, time,
 *   captions, fullscreen, and the playback speed menu
 * @position Lab media parts; VideoPlayer and AudioPlayer arrange them, and
 *   custom layouts can arrange them inside any MediaPlayer
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {Button} from '@astryxdesign/core/Button';
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@astryxdesign/core/DropdownMenu';
import {IconButton, type IconButtonProps} from '@astryxdesign/core/IconButton';
import {useLocale, useTranslator} from '@astryxdesign/core/i18n';
import {Slider} from '@astryxdesign/core/Slider';
import {
  colorVars,
  radiusVars,
  spacingVars,
  typeScaleVars,
  typographyVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {
  composeEventHandlers,
  mergeProps,
  observeResize,
  themeProps,
} from '@astryxdesign/core/utils';
import {
  DEFAULT_PLAYBACK_RATES,
  formatClock,
  formatSpokenTime,
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
  previewLine: {
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
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

/**
 * Mutes and unmutes the media. Its icon follows the volume.
 *
 * @example
 * ```
 * <MediaMuteButton />
 * ```
 */
export function MediaMuteButton({
  size,
  onClick,
  xstyle,
  className,
  style,
  ...rest
}: MediaButtonPartProps) {
  const {store} = useMediaPlayerContext('MediaMuteButton');
  const isMuted = useMediaSelector('MediaMuteButton', state => state.isMuted);
  const volume = useMediaSelector('MediaMuteButton', state => state.volume);
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
      {...rest}
      label={label}
      tooltip={label}
      icon={icon}
      variant="ghost"
      size={size}
      onClick={composeEventHandlers(onClick, () => store.actions.toggleMuted())}
      {...mergeProps(themeProps('media-mute-button'), {className, style})}
      xstyle={xstyle}
    />
  );
}

MediaMuteButton.displayName = 'MediaMuteButton';

export interface MediaVolumeSliderProps extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange' | 'children'
> {
  /** Slider width. Defaults to 88px. */
  width?: number | string;
  /** Ref to the slider thumb. */
  ref?: Ref<HTMLDivElement>;
}

/**
 * Sets the volume and shows it as a percentage in a tooltip while it is
 * hovered, dragged, or focused. It renders nothing where script cannot set
 * the volume, such as iOS Safari; MediaMuteButton still works there.
 *
 * @example
 * ```
 * <MediaMuteButton />
 * <MediaVolumeSlider width={72} />
 * ```
 */
export function MediaVolumeSlider({
  width = 88,
  xstyle,
  className,
  style,
  ...rest
}: MediaVolumeSliderProps) {
  const {store} = useMediaPlayerContext('MediaVolumeSlider');
  const canSetVolume = useMediaSelector(
    'MediaVolumeSlider',
    state => state.canSetVolume,
  );
  const volume = useMediaSelector('MediaVolumeSlider', state =>
    state.isMuted ? 0 : state.volume,
  );
  const t = useTranslator();
  const locale = useLocale();
  const percent = useMemo(
    () => new Intl.NumberFormat(locale, {style: 'percent'}),
    [locale],
  );
  if (!canSetVolume) {
    return null;
  }
  return (
    <Slider
      {...rest}
      label={t('@astryx.mediaPlayer.volume')}
      isLabelHidden
      min={0}
      max={100}
      step={1}
      value={Math.round(volume * 100)}
      valueDisplay="tooltip"
      formatValue={value => percent.format(value / 100)}
      onChange={(value: number) => store.actions.setVolume(value / 100)}
      width={width}
      {...mergeProps(themeProps('media-volume-slider'), {className, style})}
      containerXstyle={xstyle}
    />
  );
}

MediaVolumeSlider.displayName = 'MediaVolumeSlider';

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
  const currentTime = useMediaSelector(
    'MediaTimeSlider',
    state => state.currentTime,
  );
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
  const value = isSeekable ? Math.min(scrubTime ?? currentTime, duration) : 0;
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
    if (
      offset == null ||
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
          ? markerList.map(marker => (
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
          {...mergeProps(themeProps('media-time-slider'), {className, style})}
          containerXstyle={xstyle}
        />
      </div>
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

export interface MediaPlaybackRateMenuProps extends Omit<
  MediaButtonPartProps,
  'onClick' | 'ref'
> {
  /**
   * Speeds the menu offers, in order. Defaults to 0.5, 0.75, 1, 1.25, 1.5,
   * 1.75, and 2, the same speeds the `<` and `>` shortcuts step through.
   */
  rates?: readonly number[];
}

/**
 * Shows the playback speed and opens a menu of speeds, with the current one
 * checked. The menu keeps the controls visible while it is open.
 *
 * @example
 * ```
 * <MediaPlaybackRateMenu rates={[0.75, 1, 1.25, 1.5, 2]} />
 * ```
 */
export function MediaPlaybackRateMenu({
  rates = DEFAULT_PLAYBACK_RATES,
  size,
  xstyle,
  className,
  style,
  ...rest
}: MediaPlaybackRateMenuProps) {
  const {store, holdControls} = useMediaPlayerContext('MediaPlaybackRateMenu');
  const rate = useMediaSelector(
    'MediaPlaybackRateMenu',
    state => state.playbackRate,
  );
  const t = useTranslator();
  const locale = useLocale();
  const numberFormat = useMemo(
    () => new Intl.NumberFormat(locale, {maximumFractionDigits: 2}),
    [locale],
  );
  const formatRate = (value: number) =>
    t('@astryx.mediaPlayer.playbackRate', {rate: numberFormat.format(value)});
  return (
    <DropdownMenu
      button={{
        ...rest,
        label: formatRate(rate),
        'aria-label': t('@astryx.mediaPlayer.playbackSpeedValue', {
          rate: numberFormat.format(rate),
        }),
        tooltip: t('@astryx.mediaPlayer.playbackSpeed'),
        variant: 'ghost',
        size,
        xstyle,
        ...mergeProps(themeProps('media-playback-rate-menu'), {
          className,
          style,
        }),
      }}
      onOpenChange={isOpen => holdControls('menu', isOpen)}>
      <DropdownMenuRadioGroup
        label={t('@astryx.mediaPlayer.playbackSpeed')}
        value={String(rate)}
        onChange={value => store.actions.setPlaybackRate(Number(value))}>
        {rates.map(option => (
          <DropdownMenuRadioItem
            key={option}
            value={String(option)}
            label={formatRate(option)}
          />
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenu>
  );
}

MediaPlaybackRateMenu.displayName = 'MediaPlaybackRateMenu';

export type MediaPlaybackRateButtonProps = MediaButtonPartProps;

/**
 * Shows the playback speed. A press switches between normal speed and the
 * last other speed, the way MediaMuteButton switches the sound off and on.
 * From normal speed with no other speed yet, it steps up one speed.
 *
 * @example
 * ```
 * <MediaPlaybackRateButton />
 * <MediaPlaybackRateSlider />
 * ```
 */
export function MediaPlaybackRateButton({
  size,
  onClick,
  xstyle,
  className,
  style,
  ...rest
}: MediaPlaybackRateButtonProps) {
  const {store} = useMediaPlayerContext('MediaPlaybackRateButton');
  const rate = useMediaSelector(
    'MediaPlaybackRateButton',
    state => state.playbackRate,
  );
  const lastRateRef = useRef<number | null>(null);
  const t = useTranslator();
  const locale = useLocale();
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(rate);
  const handleClick = () => {
    const current = store.getState().playbackRate;
    if (current !== 1) {
      lastRateRef.current = current;
      store.actions.setPlaybackRate(1);
      return;
    }
    const next =
      lastRateRef.current ??
      DEFAULT_PLAYBACK_RATES.find(option => option > 1) ??
      1;
    store.actions.setPlaybackRate(next);
  };
  return (
    <Button
      {...rest}
      label={t('@astryx.mediaPlayer.playbackRate', {rate: formatted})}
      aria-label={t('@astryx.mediaPlayer.playbackSpeedValue', {
        rate: formatted,
      })}
      tooltip={t('@astryx.mediaPlayer.playbackSpeed')}
      variant="ghost"
      size={size}
      onClick={composeEventHandlers(onClick, handleClick)}
      {...mergeProps(themeProps('media-playback-rate-button'), {
        className,
        style,
      })}
      xstyle={xstyle}
    />
  );
}

MediaPlaybackRateButton.displayName = 'MediaPlaybackRateButton';

export interface MediaPlaybackRateSliderProps extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange' | 'children'
> {
  /**
   * Speeds the slider steps through, in order. Defaults to 0.5, 0.75, 1,
   * 1.25, 1.5, 1.75, and 2, the same speeds the `<` and `>` shortcuts use.
   */
  rates?: readonly number[];
  /** Slider width. Defaults to 88px. */
  width?: number | string;
  /** Ref to the slider thumb. */
  ref?: Ref<HTMLDivElement>;
}

/**
 * Sets the playback speed in steps and shows the speed in a tooltip while it
 * is hovered, dragged, or focused.
 *
 * @example
 * ```
 * <MediaPlaybackRateSlider rates={[0.75, 1, 1.25, 1.5, 2]} />
 * ```
 */
export function MediaPlaybackRateSlider({
  rates = DEFAULT_PLAYBACK_RATES,
  width = 88,
  xstyle,
  className,
  style,
  ...rest
}: MediaPlaybackRateSliderProps) {
  const {store} = useMediaPlayerContext('MediaPlaybackRateSlider');
  const rate = useMediaSelector(
    'MediaPlaybackRateSlider',
    state => state.playbackRate,
  );
  const t = useTranslator();
  const locale = useLocale();
  const numberFormat = useMemo(
    () => new Intl.NumberFormat(locale, {maximumFractionDigits: 2}),
    [locale],
  );
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
      {...rest}
      label={t('@astryx.mediaPlayer.playbackSpeed')}
      isLabelHidden
      min={0}
      max={Math.max(rates.length - 1, 1)}
      step={1}
      value={index}
      valueDisplay="tooltip"
      formatValue={value =>
        t('@astryx.mediaPlayer.playbackRate', {
          rate: numberFormat.format(rates[value] ?? 1),
        })
      }
      onChange={(value: number) =>
        store.actions.setPlaybackRate(rates[value] ?? 1)
      }
      width={width}
      {...mergeProps(themeProps('media-playback-rate-slider'), {
        className,
        style,
      })}
      containerXstyle={xstyle}
    />
  );
}

MediaPlaybackRateSlider.displayName = 'MediaPlaybackRateSlider';
