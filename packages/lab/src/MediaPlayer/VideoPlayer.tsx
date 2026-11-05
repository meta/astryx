// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file VideoPlayer.tsx
 * @input A video source, an accessible label, an optional poster and caption
 *   tracks, playback options, and root style props
 * @output Exports VideoPlayer, a ready-made video player whose controls float
 *   in a frosted bar over the video, and VideoPlayerCaptionTrack
 * @position Lab media preset; composes MediaPlayer with its video and control
 *   parts
 */

import {useEffect, useRef, type RefObject} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {useTranslator} from '@astryxdesign/core/i18n';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Text} from '@astryxdesign/core/Text';
import {MediaTheme} from '@astryxdesign/core/theme';
import {observeResize} from '@astryxdesign/core/utils';
import {
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {MediaPlayer, type MediaPlayerProps} from './MediaPlayer';
import {useMediaPlayerContext, useMediaSelector} from './MediaPlayerContext';
import {
  MediaCaptionsButton,
  MediaFullscreenButton,
  MediaPlayButton,
  MediaTime,
  MediaTimeSlider,
  MediaVolume,
  type MediaTimelineChapter,
  type MediaTimelineMarker,
} from './MediaPlayerControls';
import {MediaPlayerElement} from './MediaPlayerElement';

const FROSTED_SURFACE = `color-mix(in srgb, ${colorVars['--color-background-surface']} 80%, transparent)`;
const FROSTED_SURFACE_HIGH_CONTRAST = `color-mix(in srgb, ${colorVars['--color-background-surface']} 95%, transparent)`;
const BAR_INSET = spacingVars['--spacing-2'];
const BAR_RADIUS = radiusVars['--radius-container'];
const PLAYER_RADIUS = radiusVars['--radius-element'];

const styles = stylex.create({
  root: {
    // A size container has no intrinsic width, so the player fills its
    // container instead of collapsing in a shrink-to-fit parent.
    inlineSize: '100%',
    containerType: 'inline-size',
    overflow: 'clip',
    borderRadius: PLAYER_RADIUS,
    backgroundColor: colorVars['--color-background-inverted'],
  },
  aspectRatio: (ratio: number) => ({
    aspectRatio: ratio,
  }),
  surface: {
    position: 'absolute',
    inset: 0,
  },
  center: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingVars['--spacing-3'],
    pointerEvents: 'none',
  },
  centerInteractive: {
    pointerEvents: 'auto',
  },
  frosted: {
    backgroundColor: {
      default: FROSTED_SURFACE,
      '@media (prefers-contrast: more)': FROSTED_SURFACE_HIGH_CONTRAST,
      '@media (prefers-reduced-transparency: reduce)':
        colorVars['--color-background-surface'],
    },
    backdropFilter: {
      default: 'blur(12px)',
      '@media (prefers-reduced-transparency: reduce)': 'none',
    },
    WebkitBackdropFilter: {
      default: 'blur(12px)',
      '@media (prefers-reduced-transparency: reduce)': 'none',
    },
  },
  bigPlay: {
    padding: spacingVars['--spacing-2'],
    borderRadius: radiusVars['--radius-full'],
  },
  bar: {
    position: 'absolute',
    insetInlineStart: BAR_INSET,
    insetInlineEnd: BAR_INSET,
    insetBlockEnd: BAR_INSET,
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    padding: spacingVars['--spacing-1'],
    borderRadius: BAR_RADIUS,
    color: colorVars['--color-text-primary'],
    opacity: 1,
    translate: '0 0',
    transitionProperty: 'opacity, translate',
    transitionDuration: {
      default: durationVars['--duration-medium'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  // The private variable carries the bar's pointer state to the timeline's
  // marker buttons, which set their own pointer events.
  barHidden: {
    opacity: 0,
    translate: `0 ${spacingVars['--spacing-2']}`,
    pointerEvents: 'none',
    '--_media-controls-pointer-events': 'none',
  },
  // Before playback, the large play control takes the bar's place. The bar
  // stays in the tab order, because the large control is pointer-only, so
  // keyboard focus inside the bar shows it.
  barBeforePlayback: {
    opacity: {
      default: 0,
      ':focus-within': 1,
    },
    translate: {
      default: `0 ${spacingVars['--spacing-2']}`,
      ':focus-within': '0 0',
    },
    pointerEvents: {
      default: 'none',
      ':focus-within': 'auto',
    },
    '--_media-controls-pointer-events': {
      default: 'none',
      ':focus-within': 'auto',
    },
  },
  // A narrow player drops the volume control from the bar.
  volume: {
    display: {
      default: 'grid',
      '@container (max-width: 480px)': 'none',
    },
  },
  time: {
    display: {
      default: 'inline',
      '@container (max-width: 360px)': 'none',
    },
  },
});

/** One caption or subtitle file for a VideoPlayer. */
export interface VideoPlayerCaptionTrack {
  /** URL of a WebVTT file. A cross-origin file needs CORS and `crossOrigin`. */
  src: string;
  /** Name shown to people, such as "English". */
  label: string;
  /** BCP 47 language tag, such as "en". */
  language: string;
  /** Defaults to `'captions'`. */
  kind?: 'captions' | 'subtitles';
  /** Shows this track when the video loads. */
  isDefault?: boolean;
}

export interface VideoPlayerProps extends Omit<
  MediaPlayerProps,
  'children' | 'label'
> {
  /** URL of the video. */
  src: string;
  /** Accessible name of the player, such as the title of the video. */
  label: string;
  /** Image shown before playback starts. */
  poster?: string;
  /** Caption and subtitle files. The captions control appears when there is one. */
  captions?: readonly VideoPlayerCaptionTrack[];
  /** Width divided by height. Defaults to 16 / 9. */
  aspectRatio?: number;
  /**
   * Starts playback when the video loads, muted, because browsers block
   * autoplay with sound. The play control stays available if the browser
   * still refuses.
   */
  hasAutoPlay?: boolean;
  /** Starts again from the beginning at the end. */
  isLooping?: boolean;
  /** How much to load before playback. Defaults to `'metadata'`. */
  preload?: 'none' | 'metadata' | 'auto';
  /** CORS mode for the video and its caption files. */
  crossOrigin?: 'anonymous' | 'use-credentials';
  /** Chapters, drawn as segments of the timeline and named in its preview. */
  chapters?: readonly MediaTimelineChapter[];
  /** Points of interest, such as timestamped comments, drawn on the timeline. */
  markers?: readonly MediaTimelineMarker[];
}

function VideoStatusLayer() {
  const {store, toggleControls, focusPlayer} =
    useMediaPlayerContext('VideoPlayer');
  const hasStarted = useMediaSelector('VideoPlayer', state => state.hasStarted);
  const isEnded = useMediaSelector('VideoPlayer', state => state.isEnded);
  const isWaiting = useMediaSelector('VideoPlayer', state => state.isWaiting);
  const hasError = useMediaSelector(
    'VideoPlayer',
    state => state.error != null,
  );
  const pointerTypeRef = useRef<string>('mouse');
  const t = useTranslator();

  return (
    <>
      <div
        aria-hidden="true"
        onPointerDown={event => {
          pointerTypeRef.current = event.pointerType;
        }}
        onClick={() => {
          // A tap shows or hides the controls, the way native players do.
          // A mouse click plays or pauses.
          if (pointerTypeRef.current === 'touch') {
            toggleControls();
          } else {
            store.actions.togglePaused();
          }
        }}
        onDoubleClick={() => {
          if (pointerTypeRef.current !== 'touch') {
            store.actions.toggleFullscreen();
          }
        }}
        {...stylex.props(styles.surface)}
      />
      <MediaTheme mode="dark">
        {hasError ? (
          <div {...stylex.props(styles.center, styles.centerInteractive)}>
            <Text type="body" color="primary">
              {t('@astryx.mediaPlayer.error')}
            </Text>
            <Button
              label={t('@astryx.mediaPlayer.retry')}
              variant="secondary"
              onClick={() => {
                // The message and this button leave once the media reloads.
                focusPlayer();
                store.actions.reload();
              }}
            />
          </div>
        ) : isWaiting && hasStarted ? (
          <div {...stylex.props(styles.center)}>
            <Spinner size="lg" shade="onMedia" aria-hidden />
          </div>
        ) : !hasStarted || isEnded ? (
          <div {...stylex.props(styles.center)}>
            <div
              {...stylex.props(
                styles.frosted,
                styles.bigPlay,
                styles.centerInteractive,
              )}>
              <MediaPlayButton
                size="lg"
                // The bar's play control does the same job, so this one stays
                // out of the tab order and the accessibility tree.
                tabIndex={-1}
                aria-hidden
                onClick={focusPlayer}
              />
            </div>
          </div>
        ) : null}
      </MediaTheme>
    </>
  );
}

interface SavedCuePosition {
  line: LineAndPositionSetting;
  lineAlign: LineAlignSetting;
  snapToLines: boolean;
}

/**
 * Keeps captions above the control bar, whether the bar shows or hides, so
 * they never jump and the bar never covers them. The gap above the bar
 * equals the bar's inset. Only cues that use the default bottom position
 * move; cues the caption author placed keep their position.
 */
function useCueLayout(
  videoRef: RefObject<HTMLVideoElement | null>,
  barRef: RefObject<HTMLDivElement | null>,
) {
  // Syncs the caption cue positions on the video's text tracks with the bar.
  useEffect(() => {
    const video = videoRef.current;
    const tracks = video?.textTracks;
    if (
      video == null ||
      tracks == null ||
      typeof tracks.addEventListener !== 'function' ||
      typeof VTTCue === 'undefined'
    ) {
      return;
    }
    const saved = new Map<VTTCue, SavedCuePosition>();
    const watched = new Set<TextTrack>();
    const watchedElements = new Set<HTMLTrackElement>();
    const apply = () => {
      // A track's cues arrive with its element's load event, which no
      // text track event reports while the media is paused.
      for (const element of video.querySelectorAll('track')) {
        if (!watchedElements.has(element)) {
          watchedElements.add(element);
          element.addEventListener('load', apply);
        }
      }
      const bar = barRef.current;
      const height = video.clientHeight;
      if (bar == null || height <= 0) {
        return;
      }
      // Layout offsets ignore the bar's hide transform, so the line holds
      // still while the bar fades in and out.
      const inset = height - (bar.offsetTop + bar.offsetHeight);
      const clearance = height - bar.offsetTop + inset;
      const line = Math.min(Math.max((1 - clearance / height) * 100, 0), 100);
      for (let index = 0; index < tracks.length; index++) {
        const track = tracks[index];
        if (track == null) {
          continue;
        }
        if (!watched.has(track)) {
          watched.add(track);
          track.addEventListener('cuechange', apply);
        }
        const cues = track.mode === 'disabled' ? null : track.cues;
        for (
          let cueIndex = 0;
          cues != null && cueIndex < cues.length;
          cueIndex++
        ) {
          const cue = cues[cueIndex];
          if (!(cue instanceof VTTCue)) {
            continue;
          }
          const original = saved.get(cue) ?? {
            line: cue.line,
            lineAlign: cue.lineAlign,
            snapToLines: cue.snapToLines,
          };
          if (original.line !== 'auto') {
            continue;
          }
          saved.set(cue, original);
          cue.snapToLines = false;
          cue.lineAlign = 'end';
          cue.line = line;
        }
      }
    };
    apply();
    tracks.addEventListener('change', apply);
    tracks.addEventListener('addtrack', apply);
    const stopObserving = observeResize(video, apply);
    return () => {
      stopObserving();
      tracks.removeEventListener('change', apply);
      tracks.removeEventListener('addtrack', apply);
      for (const track of watched) {
        track.removeEventListener('cuechange', apply);
      }
      for (const element of watchedElements) {
        element.removeEventListener('load', apply);
      }
      for (const [cue, original] of saved) {
        cue.snapToLines = original.snapToLines;
        cue.lineAlign = original.lineAlign;
        cue.line = original.line;
      }
    };
  }, [videoRef, barRef]);
}

function VideoControlBar({
  videoRef,
  chapters,
  markers,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  chapters?: readonly MediaTimelineChapter[];
  markers?: readonly MediaTimelineMarker[];
}) {
  const {isControlsVisible} = useMediaPlayerContext('VideoPlayer');
  // After the end, the bar stays available beside the replay control, so the
  // timeline stays in reach.
  const isBeforePlayback = useMediaSelector(
    'VideoPlayer',
    state => state.error == null && !state.hasStarted,
  );
  const barRef = useRef<HTMLDivElement | null>(null);
  useCueLayout(videoRef, barRef);
  return (
    <MediaTheme mode="dark">
      <div
        ref={barRef}
        dir="ltr"
        data-visible={isControlsVisible ? 'true' : 'false'}
        {...stylex.props(
          styles.frosted,
          styles.bar,
          !isControlsVisible && styles.barHidden,
          isBeforePlayback && styles.barBeforePlayback,
        )}>
        <MediaPlayButton />
        <MediaTimeSlider chapters={chapters} markers={markers} />
        <MediaTime xstyle={styles.time} />
        <MediaVolume xstyle={styles.volume} />
        <MediaCaptionsButton />
        <MediaFullscreenButton />
      </div>
    </MediaTheme>
  );
}

/**
 * A ready-made video player. Its controls float in a frosted bar inset over
 * the video. The bar shows on hover, pointer movement, and keyboard focus,
 * and hides after two idle seconds while the video plays. On touch, a tap
 * shows the bar and the next tap hides it.
 *
 * @example
 * ```
 * <VideoPlayer
 *   src="/media/product-tour.mp4"
 *   poster="/media/product-tour.jpg"
 *   label="Product tour"
 * />
 * ```
 */
export function VideoPlayer({
  src,
  label,
  poster,
  captions,
  aspectRatio = 16 / 9,
  hasAutoPlay = false,
  isLooping = false,
  preload = 'metadata',
  crossOrigin,
  chapters,
  markers,
  xstyle,
  ...rest
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  return (
    <MediaPlayer
      {...rest}
      label={label}
      xstyle={[styles.root, styles.aspectRatio(aspectRatio), xstyle]}>
      <MediaPlayerElement
        kind="video"
        ref={videoRef}
        src={src}
        poster={poster}
        preload={preload}
        crossOrigin={crossOrigin}
        autoPlay={hasAutoPlay}
        muted={hasAutoPlay}
        loop={isLooping}>
        {captions?.map(track => (
          <track
            key={track.src}
            kind={track.kind ?? 'captions'}
            src={track.src}
            label={track.label}
            srcLang={track.language}
            default={track.isDefault}
          />
        ))}
      </MediaPlayerElement>
      <VideoStatusLayer />
      <VideoControlBar
        videoRef={videoRef}
        chapters={chapters}
        markers={markers}
      />
    </MediaPlayer>
  );
}

VideoPlayer.displayName = 'VideoPlayer';
