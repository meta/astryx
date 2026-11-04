// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MediaPlayerContext.ts
 * @input The store and control-visibility state that MediaPlayer creates
 * @output MediaPlayerContext, the internal hooks the parts share, the public
 *   useMediaPlayer hook, and the time formatters
 * @position Internal to MediaPlayer; every part reads its player from here
 */

import {createContext, use, useMemo, useSyncExternalStore} from 'react';
import {
  INITIAL_MEDIA_STATE,
  type MediaPlayerActions,
  type MediaPlayerState,
  type MediaStore,
} from './mediaStore';

/** A reason that keeps the controls visible while playback runs. */
export type MediaControlsHold = 'focus' | 'scrub' | 'menu';

/**
 * Playback speeds the speed menu offers and the `<` and `>` shortcuts step
 * through.
 */
export const DEFAULT_PLAYBACK_RATES: readonly number[] = [
  0.5, 0.75, 1, 1.25, 1.5, 1.75, 2,
];

export interface MediaPlayerContextValue {
  store: MediaStore;
  isControlsVisible: boolean;
  /** Shows the controls and restarts the idle timer. */
  wakeControls: () => void;
  /** Keeps the controls visible until the same hold is released. */
  holdControls: (hold: MediaControlsHold, isHeld: boolean) => void;
  /**
   * Shows hidden controls or hides visible ones, for a tap on the media.
   * Controls a tap shows stay until the next tap.
   */
  toggleControls: () => void;
  /**
   * Moves keyboard focus to the player root, for a control that is about to
   * unmount while it has focus.
   */
  focusPlayer: () => void;
  /** The time a pointer drags the timeline to, before the seek commits. */
  scrubTime: number | null;
  setScrubTime: (time: number | null) => void;
}

export const MediaPlayerContext = createContext<MediaPlayerContextValue | null>(
  null,
);

export function useMediaPlayerContext(part: string): MediaPlayerContextValue {
  const context = use(MediaPlayerContext);
  if (context == null) {
    throw new Error(`${part} must be rendered inside a MediaPlayer.`);
  }
  return context;
}

const getServerState = () => INITIAL_MEDIA_STATE;

/** Reads one value of the player state and re-renders only when it changes. */
export function useMediaSelector<T>(
  part: string,
  selector: (state: MediaPlayerState) => T,
): T {
  const {store} = useMediaPlayerContext(part);
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(INITIAL_MEDIA_STATE),
  );
}

/** The state and actions of the nearest MediaPlayer. */
export interface UseMediaPlayerResult extends MediaPlayerActions {
  state: MediaPlayerState;
}

/**
 * Reads the nearest MediaPlayer's playback state and returns the actions
 * that drive it. Use it to build custom controls inside a MediaPlayer.
 *
 * @example
 * ```
 * function ElapsedPercent() {
 *   const {state} = useMediaPlayer();
 *   const percent = state.duration > 0 ? state.currentTime / state.duration : 0;
 *   return <Text type="supporting">{Math.round(percent * 100)}%</Text>;
 * }
 * ```
 */
export function useMediaPlayer(): UseMediaPlayerResult {
  const {store} = useMediaPlayerContext('useMediaPlayer');
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    getServerState,
  );
  return useMemo(() => ({...store.actions, state}), [store, state]);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Formats seconds as m:ss, or h:mm:ss when `hasHours` is true. */
export function formatClock(seconds: number, hasHours = false): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hasHours || hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(rest)}`;
  }
  return `${minutes}:${pad(rest)}`;
}

interface DurationFormatConstructor {
  new (
    locale: string,
    options: {style: 'long'; secondsDisplay?: 'always' | 'auto'},
  ): {
    format: (duration: {
      hours?: number;
      minutes?: number;
      seconds?: number;
    }) => string;
  };
}

/**
 * Formats seconds as words for assistive technology, such as "1 minute,
 * 5 seconds". Falls back to the clock form where the browser has no
 * Intl.DurationFormat.
 */
export function formatSpokenTime(seconds: number, locale: string): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const DurationFormat = (
    Intl as unknown as {DurationFormat?: DurationFormatConstructor}
  ).DurationFormat;
  if (DurationFormat == null) {
    return formatClock(total);
  }
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  try {
    // DurationFormat leaves out zero units, so zero needs its seconds shown.
    return total === 0
      ? new DurationFormat(locale, {
          style: 'long',
          secondsDisplay: 'always',
        }).format({seconds: 0})
      : new DurationFormat(locale, {style: 'long'}).format({
          hours,
          minutes,
          seconds: rest,
        });
  } catch {
    return formatClock(total);
  }
}
