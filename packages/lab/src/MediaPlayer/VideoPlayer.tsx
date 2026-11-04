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
import {
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
  shadowVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {MediaPlayer, type MediaPlayerProps} from './MediaPlayer';
import {useMediaPlayerContext, useMediaSelector} from './MediaPlayerContext';
import {
  MediaCaptionsButton,
  MediaFullscreenButton,
  MediaMuteButton,
  MediaPlayButton,
  MediaTime,
  MediaTimeSlider,
  MediaVolumeSlider,
} from './MediaPlayerControls';
import {MediaPlayerVideo} from './MediaPlayerMedia';

const FROSTED_SURFACE = `color-mix(in srgb, ${colorVars['--color-background-surface']} 80%, transparent)`;
const FROSTED_SURFACE_HIGH_CONTRAST = `color-mix(in srgb, ${colorVars['--color-background-surface']} 95%, transparent)`;
const BAR_INSET = spacingVars['--spacing-3'];
const BAR_RADIUS = radiusVars['--radius-container'];
// The player's corners nest around the bar's corners: the outer radius is the
// bar radius plus the bar inset. A square bar keeps the player square.
const PLAYER_RADIUS = `calc(${BAR_RADIUS} + min(${BAR_INSET}, ${BAR_RADIUS} * 1000))`;

const styles = stylex.create({
  root: {
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
    boxShadow: shadowVars['--shadow-low'],
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
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
    borderRadius: BAR_RADIUS,
    color: colorVars['--color-text-primary'],
    opacity: 1,
    translate: '0 0',
    transitionProperty: 'opacity, translate',
    transitionDuration: durationVars['--duration-medium'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  barHidden: {
    opacity: 0,
    translate: `0 ${spacingVars['--spacing-2']}`,
    pointerEvents: 'none',
  },
  volume: {
    display: {
      default: 'flex',
      '@container (max-width: 480px)': 'none',
    },
    alignItems: 'center',
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
}

function VideoStatusLayer() {
  const {store, toggleControls} = useMediaPlayerContext('VideoPlayer');
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
              onClick={() => store.actions.reload()}
            />
          </div>
        ) : isWaiting && hasStarted ? (
          <div {...stylex.props(styles.center)}>
            <Spinner
              size="lg"
              shade="onMedia"
              aria-label={t('@astryx.mediaPlayer.loading')}
            />
          </div>
        ) : !hasStarted || isEnded ? (
          <div {...stylex.props(styles.center)}>
            <div
              {...stylex.props(
                styles.frosted,
                styles.bigPlay,
                styles.centerInteractive,
              )}>
              <MediaPlayButton size="lg" />
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
 * Keeps a showing caption above the control bar while the bar shows. Only
 * cues that use the default bottom position move; cues the caption author
 * placed keep their position.
 */
function useCueClearance(
  videoRef: RefObject<HTMLVideoElement | null>,
  barRef: RefObject<HTMLDivElement | null>,
  isRaised: boolean,
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
    const apply = () => {
      const bar = barRef.current;
      const height = video.clientHeight;
      const clearance =
        isRaised && bar != null && height > 0
          ? ((height - bar.offsetTop) / height) * 100
          : 0;
      for (let index = 0; index < tracks.length; index++) {
        const track = tracks[index];
        if (track == null) {
          continue;
        }
        if (!watched.has(track)) {
          watched.add(track);
          track.addEventListener('cuechange', apply);
        }
        const cues = track.mode === 'showing' ? track.cues : null;
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
          if (clearance > 0) {
            cue.snapToLines = false;
            cue.lineAlign = 'end';
            cue.line = Math.max(0, 100 - clearance - 2);
          } else {
            cue.snapToLines = original.snapToLines;
            cue.lineAlign = original.lineAlign;
            cue.line = original.line;
          }
        }
      }
    };
    apply();
    tracks.addEventListener('change', apply);
    tracks.addEventListener('addtrack', apply);
    return () => {
      tracks.removeEventListener('change', apply);
      tracks.removeEventListener('addtrack', apply);
      for (const track of watched) {
        track.removeEventListener('cuechange', apply);
      }
      for (const [cue, original] of saved) {
        cue.snapToLines = original.snapToLines;
        cue.lineAlign = original.lineAlign;
        cue.line = original.line;
      }
    };
  }, [videoRef, barRef, isRaised]);
}

function VideoControlBar({
  videoRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const {isControlsVisible} = useMediaPlayerContext('VideoPlayer');
  const barRef = useRef<HTMLDivElement | null>(null);
  useCueClearance(videoRef, barRef, isControlsVisible);
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
        )}>
        <MediaPlayButton />
        <MediaTimeSlider />
        <MediaTime xstyle={styles.time} />
        <div {...stylex.props(styles.volume)}>
          <MediaMuteButton />
          <MediaVolumeSlider width={72} />
        </div>
        <MediaCaptionsButton />
        <MediaFullscreenButton />
      </div>
    </MediaTheme>
  );
}

/**
 * A ready-made video player. Its controls float in a frosted bar inset over
 * the video. The bar shows on hover, pointer movement, and keyboard focus,
 * and hides after two idle seconds while the video plays.
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
  xstyle,
  ...rest
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  return (
    <MediaPlayer
      {...rest}
      label={label}
      xstyle={[styles.root, styles.aspectRatio(aspectRatio), xstyle]}>
      <MediaPlayerVideo
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
      </MediaPlayerVideo>
      <VideoStatusLayer />
      <VideoControlBar videoRef={videoRef} />
    </MediaPlayer>
  );
}

VideoPlayer.displayName = 'VideoPlayer';
