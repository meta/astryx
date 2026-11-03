// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MediaPlayer.tsx
 * @input An accessible label, media and control parts as children, playback
 *   callbacks, and root DOM props
 * @output Exports MediaPlayer, the root that owns one player's playback state,
 *   keyboard shortcuts, announcements, and control visibility
 * @position Lab media root; VideoPlayer and AudioPlayer compose it, and custom
 *   layouts compose it with the parts in MediaPlayerControls.tsx
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
import {useAnnounce, useMergedRefs} from '@astryxdesign/core/hooks';
import {useLocale, useTranslator} from '@astryxdesign/core/i18n';
import {
  focusOutlineProps,
  mergeProps,
  themeProps,
} from '@astryxdesign/core/utils';
import {
  MediaPlayerContext,
  formatSpokenTime,
  type MediaControlsHold,
  type MediaPlayerContextValue,
} from './MediaPlayerContext';
import {
  createMediaStore,
  type MediaPlayerError,
  type MediaStore,
} from './mediaStore';

/** Idle time, in milliseconds, before playing media hides its controls. */
const IDLE_DELAY_MS = 2000;

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const styles = stylex.create({
  root: {
    position: 'relative',
    minWidth: 0,
  },
  idle: {
    cursor: {
      default: 'none',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
});

export interface MediaPlayerProps extends Omit<
  BaseProps<HTMLDivElement>,
  'onPlay' | 'onPause' | 'onEnded' | 'onError'
> {
  /** Accessible name of the player, such as the title of the media. */
  label: string;
  /** The media element part and the control parts. */
  children?: ReactNode;
  /** Called when playback starts or resumes. */
  onPlay?: () => void;
  /** Called when playback pauses. */
  onPause?: () => void;
  /** Called when playback reaches the end. */
  onEnded?: () => void;
  /** Called when the media element reports an error. */
  onError?: (error: MediaPlayerError) => void;
  /** Ref to the root element, which also goes fullscreen. */
  ref?: Ref<HTMLDivElement>;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return ![
      'button',
      'checkbox',
      'radio',
      'range',
      'reset',
      'submit',
    ].includes(target.type);
  }
  return false;
}

function isFocusVisible(element: Element): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return false;
  }
}

function useControlsVisibility(store: MediaStore) {
  const isPlaying = useSyncExternalStore(
    store.subscribe,
    () => {
      const state = store.getState();
      return !state.isPaused && !state.isEnded;
    },
    () => false,
  );
  const [isIdle, setIsIdle] = useState(false);
  const holdsRef = useRef(new Set<MediaControlsHold>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleIdle = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (holdsRef.current.size === 0) {
        setIsIdle(true);
      }
    }, IDLE_DELAY_MS);
  }, [clearTimer]);

  const wakeControls = useCallback(() => {
    setIsIdle(false);
    scheduleIdle();
  }, [scheduleIdle]);

  const holdControls = useCallback(
    (hold: MediaControlsHold, isHeld: boolean) => {
      if (isHeld) {
        holdsRef.current.add(hold);
        clearTimer();
        setIsIdle(false);
      } else if (holdsRef.current.delete(hold)) {
        scheduleIdle();
      }
    },
    [clearTimer, scheduleIdle],
  );

  const hideControls = useCallback(() => {
    if (holdsRef.current.size === 0) {
      clearTimer();
      setIsIdle(true);
    }
  }, [clearTimer]);

  const toggleControls = useCallback(() => {
    setIsIdle(wasIdle => {
      if (wasIdle) {
        scheduleIdle();
        return false;
      }
      clearTimer();
      return holdsRef.current.size === 0;
    });
  }, [clearTimer, scheduleIdle]);

  // Syncs the idle timer with playback: it runs only while the media plays.
  useEffect(() => {
    if (isPlaying) {
      scheduleIdle();
    } else {
      clearTimer();
    }
    return clearTimer;
  }, [isPlaying, scheduleIdle, clearTimer]);

  return {
    isControlsVisible: !isPlaying || !isIdle,
    wakeControls,
    holdControls,
    hideControls,
    toggleControls,
  };
}

/**
 * The root of one media player. It owns the playback state of the media
 * element inside it, scopes keyboard shortcuts to itself, announces changes
 * those shortcuts make, and decides when the controls show.
 */
export function MediaPlayer({
  label,
  children,
  onPlay,
  onPause,
  onEnded,
  onError,
  onKeyDown,
  onPointerMove,
  onPointerDown,
  onPointerLeave,
  onFocus,
  onBlur,
  xstyle,
  className,
  style,
  ref,
  ...rest
}: MediaPlayerProps) {
  const [store] = useState(createMediaStore);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mergedRef = useMergedRefs(ref, containerRef);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const visibility = useControlsVisibility(store);
  const {wakeControls, holdControls, hideControls, toggleControls} = visibility;
  const announce = useAnnounce({hasReplace: true});
  const t = useTranslator();
  const locale = useLocale();

  const callbacksRef = useRef({onPlay, onPause, onEnded, onError});
  // Syncs the latest callbacks into the ref the store listener reads.
  useLayoutEffect(() => {
    callbacksRef.current = {onPlay, onPause, onEnded, onError};
  });

  // Syncs the root element into the store, which makes it the fullscreen target.
  useLayoutEffect(() => {
    store.attachContainer(containerRef.current);
    return () => store.attachContainer(null);
  }, [store]);

  // Syncs media element events to the playback callbacks. The listener runs
  // inside the media event, so each callback fires once per transition.
  useEffect(() => {
    let previous = store.getState();
    return store.subscribe(() => {
      const next = store.getState();
      const callbacks = callbacksRef.current;
      if (previous.isPaused && !next.isPaused) {
        callbacks.onPlay?.();
      }
      if (!previous.isPaused && next.isPaused && !next.isEnded) {
        callbacks.onPause?.();
      }
      if (!previous.isEnded && next.isEnded) {
        callbacks.onEnded?.();
      }
      if (previous.error == null && next.error != null) {
        announce(t('@astryx.mediaPlayer.error'), 'assertive');
        callbacks.onError?.(next.error);
      }
      previous = next;
    });
  }, [store, announce, t]);

  const contextValue = useMemo<MediaPlayerContextValue>(
    () => ({
      store,
      isControlsVisible: visibility.isControlsVisible,
      wakeControls,
      holdControls,
      toggleControls,
      scrubTime,
      setScrubTime,
    }),
    [
      store,
      visibility.isControlsVisible,
      wakeControls,
      holdControls,
      toggleControls,
      scrubTime,
    ],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    wakeControls();
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    const target = event.target as HTMLElement;
    if (isEditableTarget(target)) {
      return;
    }
    const isOnControl =
      target.closest('button, a[href], [role="menuitem"]') != null;
    const isOnSlider = target.getAttribute('role') === 'slider';
    const state = store.getState();
    const {actions} = store;
    const hasDuration = Number.isFinite(state.duration) && state.duration > 0;
    const seekBy = (offset: number) => {
      if (!hasDuration) {
        return;
      }
      actions.seekBy(offset);
      announce(formatSpokenTime(store.getState().currentTime, locale));
    };
    const setVolume = (offset: number) => {
      if (!state.canSetVolume) {
        return;
      }
      const next =
        Math.round((state.isMuted ? 0 : state.volume) * 100 + offset * 100) /
        100;
      actions.setVolume(next);
      announce(
        t('@astryx.mediaPlayer.announceVolume', {
          percent: new Intl.NumberFormat(locale, {style: 'percent'}).format(
            Math.min(Math.max(next, 0), 1),
          ),
        }),
      );
    };
    const stepRate = (direction: 1 | -1) => {
      const index = PLAYBACK_RATES.findIndex(
        rate => rate >= state.playbackRate,
      );
      const current = index === -1 ? PLAYBACK_RATES.length - 1 : index;
      const next =
        PLAYBACK_RATES[
          Math.min(Math.max(current + direction, 0), PLAYBACK_RATES.length - 1)
        ];
      if (next != null) {
        actions.setPlaybackRate(next);
        announce(
          t('@astryx.mediaPlayer.announceSpeed', {
            rate: new Intl.NumberFormat(locale, {
              maximumFractionDigits: 2,
            }).format(next),
          }),
        );
      }
    };

    switch (event.key) {
      case ' ':
        if (isOnControl || isOnSlider) {
          return;
        }
        actions.togglePaused();
        break;
      case 'k':
      case 'K':
        actions.togglePaused();
        break;
      case 'm':
      case 'M':
        actions.toggleMuted();
        announce(
          t(
            store.getState().isMuted
              ? '@astryx.mediaPlayer.announceMuted'
              : '@astryx.mediaPlayer.announceUnmuted',
          ),
        );
        break;
      case 'f':
      case 'F':
        if (!state.canFullscreen) {
          return;
        }
        actions.toggleFullscreen();
        break;
      case 'c':
      case 'C':
        if (state.textTracks.length === 0) {
          return;
        }
        actions.toggleCaptions();
        announce(
          t(
            store.getState().activeTextTrackId == null
              ? '@astryx.mediaPlayer.announceCaptionsOff'
              : '@astryx.mediaPlayer.announceCaptionsOn',
          ),
        );
        break;
      case 'ArrowLeft':
        if (isOnSlider) {
          return;
        }
        seekBy(-5);
        break;
      case 'ArrowRight':
        if (isOnSlider) {
          return;
        }
        seekBy(5);
        break;
      case 'j':
      case 'J':
        seekBy(-10);
        break;
      case 'l':
      case 'L':
        seekBy(10);
        break;
      case 'ArrowUp':
        if (isOnSlider) {
          return;
        }
        setVolume(0.05);
        break;
      case 'ArrowDown':
        if (isOnSlider) {
          return;
        }
        setVolume(-0.05);
        break;
      case '<':
        stepRate(-1);
        break;
      case '>':
        stepRate(1);
        break;
      default: {
        const digit = /^[0-9]$/.test(event.key) ? Number(event.key) : null;
        if (digit == null || !hasDuration || isOnSlider) {
          return;
        }
        actions.seek((state.duration * digit) / 10);
        announce(formatSpokenTime(store.getState().currentTime, locale));
      }
    }
    event.preventDefault();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    onPointerMove?.(event);
    if (event.pointerType === 'mouse') {
      wakeControls();
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    onPointerDown?.(event);
    if (event.pointerType !== 'touch') {
      wakeControls();
    }
  };

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    onPointerLeave?.(event);
    if (event.pointerType === 'mouse') {
      hideControls();
    }
  };

  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    onFocus?.(event);
    holdControls('focus', isFocusVisible(event.target));
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    onBlur?.(event);
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
      holdControls('focus', false);
    }
  };

  return (
    <MediaPlayerContext value={contextValue}>
      <div
        {...rest}
        ref={mergedRef}
        role="group"
        aria-label={label}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...mergeProps(
          themeProps('media-player', {
            controls: visibility.isControlsVisible ? 'visible' : 'hidden',
          }),
          focusOutlineProps.focusVisible(
            styles.root,
            !visibility.isControlsVisible && styles.idle,
            xstyle,
          ),
          className,
          style,
        )}>
        {children}
      </div>
    </MediaPlayerContext>
  );
}

MediaPlayer.displayName = 'MediaPlayer';
