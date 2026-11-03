// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MediaPlayerControls.tsx
 * @input The nearest MediaPlayer's state and actions, plus per-part size and
 *   style props
 * @output Exports the control parts: play, seek, mute, volume, timeline, time,
 *   captions, fullscreen, and playback rate
 * @position Lab media parts; VideoPlayer and AudioPlayer arrange them, and
 *   custom layouts can arrange them inside any MediaPlayer
 */

import {useMemo, useRef, type CSSProperties, type KeyboardEvent} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {useLocale, useTranslator} from '@astryxdesign/core/i18n';
import {Slider} from '@astryxdesign/core/Slider';
import {colorVars, typeScaleVars} from '@astryxdesign/core/theme/tokens.stylex';
import {ToggleButton} from '@astryxdesign/core/ToggleButton';
import {mergeProps, themeProps} from '@astryxdesign/core/utils';
import {
  formatClock,
  formatSpokenTime,
  useMediaPlayerContext,
  useMediaSelector,
} from './MediaPlayerContext';
import {
  CaptionsGlyph,
  FullscreenEnterGlyph,
  FullscreenExitGlyph,
  PauseGlyph,
  PlayGlyph,
  ReplayGlyph,
  VolumeHighGlyph,
  VolumeLowGlyph,
  VolumeOffGlyph,
  createSkipGlyph,
} from './mediaGlyphs';

/** Control height on the shared element-size scale: 28, 32, or 36px. */
export type MediaControlSize = 'sm' | 'md' | 'lg';

interface MediaPartStyleProps {
  xstyle?: StyleXStyles;
  className?: string;
  style?: CSSProperties;
}

interface MediaButtonPartProps extends MediaPartStyleProps {
  /** Control height. Defaults to `'md'`. */
  size?: MediaControlSize;
}

const styles = stylex.create({
  timeline: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
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

const DEFAULT_RATES: readonly number[] = [1, 1.25, 1.5, 2, 0.75];

export interface MediaPlayButtonProps extends MediaButtonPartProps {
  /** Button emphasis. Defaults to `'ghost'`. */
  variant?: 'primary' | 'secondary' | 'ghost';
}

/** Plays and pauses the media. After the end it replays from the start. */
export function MediaPlayButton({
  size = 'md',
  variant = 'ghost',
  xstyle,
  className,
  style,
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
  const glyph = isEnded ? ReplayGlyph : isPaused ? PlayGlyph : PauseGlyph;
  return (
    <IconButton
      label={label}
      tooltip={label}
      icon={<Icon icon={glyph} />}
      variant={variant}
      size={size}
      onClick={() => store.actions.togglePaused()}
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

/** Skips back or forward by a fixed number of seconds. */
export function MediaSeekButton({
  offset,
  size = 'md',
  xstyle,
  className,
  style,
}: MediaSeekButtonProps) {
  const {store} = useMediaPlayerContext('MediaSeekButton');
  const duration = useMediaSelector('MediaSeekButton', state => state.duration);
  const t = useTranslator();
  const seconds = Math.abs(Math.round(offset));
  const label =
    offset < 0
      ? t('@astryx.mediaPlayer.skipBack', {seconds})
      : t('@astryx.mediaPlayer.skipForward', {seconds});
  const glyph = useMemo(() => createSkipGlyph(offset), [offset]);
  return (
    <IconButton
      label={label}
      tooltip={label}
      icon={<Icon icon={glyph} />}
      variant="ghost"
      size={size}
      isDisabled={!(Number.isFinite(duration) && duration > 0)}
      onClick={() => store.actions.seekBy(offset)}
      {...mergeProps(themeProps('media-seek-button'), {className, style})}
      xstyle={xstyle}
    />
  );
}

MediaSeekButton.displayName = 'MediaSeekButton';

/** Mutes and unmutes the media. Its icon follows the volume. */
export function MediaMuteButton({
  size = 'md',
  xstyle,
  className,
  style,
}: MediaButtonPartProps) {
  const {store} = useMediaPlayerContext('MediaMuteButton');
  const isMuted = useMediaSelector('MediaMuteButton', state => state.isMuted);
  const volume = useMediaSelector('MediaMuteButton', state => state.volume);
  const t = useTranslator();
  const isSilent = isMuted || volume === 0;
  const label = isSilent
    ? t('@astryx.mediaPlayer.unmute')
    : t('@astryx.mediaPlayer.mute');
  const glyph = isSilent
    ? VolumeOffGlyph
    : volume < 0.5
      ? VolumeLowGlyph
      : VolumeHighGlyph;
  return (
    <IconButton
      label={label}
      tooltip={label}
      icon={<Icon icon={glyph} />}
      variant="ghost"
      size={size}
      onClick={() => store.actions.toggleMuted()}
      {...mergeProps(themeProps('media-mute-button'), {className, style})}
      xstyle={xstyle}
    />
  );
}

MediaMuteButton.displayName = 'MediaMuteButton';

export interface MediaVolumeSliderProps extends MediaPartStyleProps {
  /** Slider width. Defaults to 88px. */
  width?: number | string;
}

/**
 * Sets the volume. It renders nothing where script cannot set the volume,
 * such as iOS Safari; MediaMuteButton still works there.
 */
export function MediaVolumeSlider({
  width = 88,
  xstyle,
  className,
  style,
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
      label={t('@astryx.mediaPlayer.volume')}
      isLabelHidden
      min={0}
      max={100}
      step={1}
      value={Math.round(volume * 100)}
      valueDisplay="none"
      formatValue={value => percent.format(value / 100)}
      onChange={(value: number) => store.actions.setVolume(value / 100)}
      width={width}
      {...mergeProps(themeProps('media-volume-slider'), {className, style})}
      containerXstyle={xstyle}
    />
  );
}

MediaVolumeSlider.displayName = 'MediaVolumeSlider';

/**
 * The timeline. Dragging previews the time and seeks on release; arrow keys
 * skip 5 seconds and Page Up and Page Down skip 10. The timeline runs left
 * to right in every direction, because it shows the direction of the media,
 * not reading order.
 */
export function MediaTimeSlider({
  xstyle,
  className,
  style,
}: MediaPartStyleProps) {
  const {store, scrubTime, setScrubTime, holdControls, wakeControls} =
    useMediaPlayerContext('MediaTimeSlider');
  const currentTime = useMediaSelector(
    'MediaTimeSlider',
    state => state.currentTime,
  );
  const duration = useMediaSelector('MediaTimeSlider', state => state.duration);
  const t = useTranslator();
  const locale = useLocale();
  const isPointerDownRef = useRef(false);
  const pendingTimeRef = useRef<number | null>(null);
  const isSeekable = Number.isFinite(duration) && duration > 0;
  const value = isSeekable ? Math.min(scrubTime ?? currentTime, duration) : 0;

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
    const offsets: Record<string, number> = {
      ArrowLeft: -5,
      ArrowDown: -5,
      ArrowRight: 5,
      ArrowUp: 5,
      PageDown: -10,
      PageUp: 10,
    };
    const offset = offsets[event.key];
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

  return (
    <div
      dir="ltr"
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
      {...mergeProps(
        themeProps('media-time-slider'),
        stylex.props(styles.timeline, xstyle),
        className,
        style,
      )}>
      <Slider
        label={t('@astryx.mediaPlayer.seek')}
        isLabelHidden
        min={0}
        max={isSeekable ? duration : 1}
        step={0.01}
        value={value}
        isDisabled={!isSeekable}
        valueDisplay="none"
        formatValue={time =>
          t('@astryx.mediaPlayer.timeValue', {
            current: formatSpokenTime(time, locale),
            duration: formatSpokenTime(duration, locale),
          })
        }
        onChange={(time: number) => {
          if (isPointerDownRef.current) {
            pendingTimeRef.current = time;
            setScrubTime(time);
          } else {
            store.actions.seek(time);
          }
        }}
        width="100%"
      />
    </div>
  );
}

MediaTimeSlider.displayName = 'MediaTimeSlider';

export interface MediaTimeProps extends MediaPartStyleProps {
  /**
   * What to show: the current time, the duration, the time left, or the
   * current time and the duration. Defaults to `'current-duration'`.
   */
  display?: 'current' | 'duration' | 'remaining' | 'current-duration';
}

/**
 * Shows playback time. A live stream shows "Live" instead. The text reads left
 * to right in every direction.
 */
export function MediaTime({
  display = 'current-duration',
  xstyle,
  className,
  style,
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
 */
export function MediaCaptionsButton({
  size = 'md',
  xstyle,
  className,
  style,
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
  if (!hasTracks) {
    return null;
  }
  const label = t('@astryx.mediaPlayer.captions');
  return (
    <ToggleButton
      label={label}
      tooltip={label}
      icon={<Icon icon={CaptionsGlyph} />}
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
 */
export function MediaFullscreenButton({
  size = 'md',
  xstyle,
  className,
  style,
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
  if (!canFullscreen) {
    return null;
  }
  const label = isFullscreen
    ? t('@astryx.mediaPlayer.exitFullscreen')
    : t('@astryx.mediaPlayer.enterFullscreen');
  return (
    <IconButton
      label={label}
      tooltip={label}
      icon={
        <Icon
          icon={isFullscreen ? FullscreenExitGlyph : FullscreenEnterGlyph}
        />
      }
      variant="ghost"
      size={size}
      onClick={() => store.actions.toggleFullscreen()}
      {...mergeProps(themeProps('media-fullscreen-button'), {className, style})}
      xstyle={xstyle}
    />
  );
}

MediaFullscreenButton.displayName = 'MediaFullscreenButton';

export interface MediaPlaybackRateButtonProps extends MediaButtonPartProps {
  /** Rates a press cycles through, in order. Defaults to 1, 1.25, 1.5, 2, 0.75. */
  rates?: readonly number[];
}

/** Shows the playback rate and moves to the next rate on each press. */
export function MediaPlaybackRateButton({
  rates = DEFAULT_RATES,
  size = 'md',
  xstyle,
  className,
  style,
}: MediaPlaybackRateButtonProps) {
  const {store} = useMediaPlayerContext('MediaPlaybackRateButton');
  const rate = useMediaSelector(
    'MediaPlaybackRateButton',
    state => state.playbackRate,
  );
  const t = useTranslator();
  const locale = useLocale();
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(rate);
  const handleClick = () => {
    const index = rates.indexOf(rate);
    const next = rates[(index + 1) % rates.length] ?? 1;
    store.actions.setPlaybackRate(next);
  };
  return (
    <Button
      label={t('@astryx.mediaPlayer.playbackRate', {rate: formatted})}
      tooltip={t('@astryx.mediaPlayer.playbackSpeed')}
      variant="ghost"
      size={size}
      onClick={handleClick}
      {...mergeProps(themeProps('media-playback-rate-button'), {
        className,
        style,
      })}
      xstyle={xstyle}
    />
  );
}

MediaPlaybackRateButton.displayName = 'MediaPlaybackRateButton';
