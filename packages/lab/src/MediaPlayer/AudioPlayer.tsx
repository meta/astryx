// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file AudioPlayer.tsx
 * @input An audio source, a title with optional subtitle and artwork, skip
 *   intervals, playback options, and root style props
 * @output Exports AudioPlayer, a ready-made player for spoken audio and music
 *   with skip, speed, and system media controls
 * @position Lab media preset; composes MediaPlayer with its audio and control
 *   parts
 */

import {useEffect} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  fontWeightVars,
  radiusVars,
  spacingVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {MediaPlayer, type MediaPlayerProps} from './MediaPlayer';
import {useMediaPlayerContext} from './MediaPlayerContext';
import {
  MediaMuteButton,
  MediaPlayButton,
  MediaPlaybackRateButton,
  MediaSeekButton,
  MediaTime,
  MediaTimeSlider,
} from './MediaPlayerControls';
import {MediaPlayerAudio} from './MediaPlayerMedia';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
    padding: spacingVars['--spacing-4'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-container'],
    backgroundColor: colorVars['--color-background-surface'],
    color: colorVars['--color-text-primary'],
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-3'],
    minWidth: 0,
  },
  artwork: {
    flexShrink: 0,
    width: 48,
    height: 48,
    objectFit: 'cover',
    borderRadius: radiusVars['--radius-element'],
  },
  titles: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  title: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: typeScaleVars['--text-body-size'],
    lineHeight: typeScaleVars['--text-body-leading'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  subtitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
  },
  times: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  secondaryTime: {
    color: colorVars['--color-text-secondary'],
  },
  controls: {
    display: 'grid',
    gridTemplateColumns: '1fr auto auto auto 1fr',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
  },
  controlsStart: {
    justifySelf: 'start',
  },
  controlsEnd: {
    justifySelf: 'end',
  },
});

export interface AudioPlayerProps extends Omit<
  MediaPlayerProps,
  'children' | 'label' | 'title'
> {
  /** URL of the audio. */
  src: string;
  /** Title of the episode or track. It also names the player. */
  title: string;
  /** Show, artist, or other supporting line. */
  subtitle?: string;
  /** Square artwork URL. Also offered to the system media controls. */
  artworkSrc?: string;
  /** Accessible name of the player. Defaults to `title`. */
  label?: string;
  /** Seconds the skip-back control moves. Defaults to 15. */
  skipBackSeconds?: number;
  /** Seconds the skip-forward control moves. Defaults to 30. */
  skipForwardSeconds?: number;
  /** How much to load before playback. Defaults to `'metadata'`. */
  preload?: 'none' | 'metadata' | 'auto';
  /** CORS mode for the audio. */
  crossOrigin?: 'anonymous' | 'use-credentials';
}

const SESSION_ACTIONS = [
  'play',
  'pause',
  'seekbackward',
  'seekforward',
  'seekto',
] as const;

/**
 * Hands the title, artwork, and transport actions to the system media
 * controls, such as the lock screen, once this player starts playback.
 */
function useMediaSession({
  title,
  subtitle,
  artworkSrc,
  skipBackSeconds,
  skipForwardSeconds,
}: {
  title: string;
  subtitle?: string;
  artworkSrc?: string;
  skipBackSeconds: number;
  skipForwardSeconds: number;
}) {
  const {store} = useMediaPlayerContext('AudioPlayer');
  // Syncs the system media session with this player while it owns playback.
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      typeof MediaMetadata === 'undefined'
    ) {
      return;
    }
    const session = navigator.mediaSession;
    const {actions} = store;
    let isOwner = false;
    const claim = () => {
      isOwner = true;
      session.metadata = new MediaMetadata({
        title,
        artist: subtitle ?? '',
        artwork: artworkSrc != null ? [{src: artworkSrc}] : [],
      });
      const handlers: Record<
        (typeof SESSION_ACTIONS)[number],
        MediaSessionActionHandler
      > = {
        play: () => void actions.play(),
        pause: () => actions.pause(),
        seekbackward: details =>
          actions.seekBy(-(details.seekOffset ?? skipBackSeconds)),
        seekforward: details =>
          actions.seekBy(details.seekOffset ?? skipForwardSeconds),
        seekto: details => {
          if (details.seekTime != null) {
            actions.seek(details.seekTime);
          }
        },
      };
      for (const action of SESSION_ACTIONS) {
        try {
          session.setActionHandler(action, handlers[action]);
        } catch {
          // Browsers that do not support an action throw; the others still work.
        }
      }
    };
    const unsubscribe = store.subscribe(() => {
      const state = store.getState();
      if (!state.isPaused && !isOwner) {
        claim();
      }
      if (isOwner) {
        session.playbackState = state.isPaused ? 'paused' : 'playing';
      }
    });
    return () => {
      unsubscribe();
      if (isOwner) {
        session.metadata = null;
        for (const action of SESSION_ACTIONS) {
          try {
            session.setActionHandler(action, null);
          } catch {
            // See above.
          }
        }
      }
    };
  }, [store, title, subtitle, artworkSrc, skipBackSeconds, skipForwardSeconds]);
}

function AudioPlayerLayout({
  title,
  subtitle,
  artworkSrc,
  skipBackSeconds,
  skipForwardSeconds,
}: {
  title: string;
  subtitle?: string;
  artworkSrc?: string;
  skipBackSeconds: number;
  skipForwardSeconds: number;
}) {
  useMediaSession({
    title,
    subtitle,
    artworkSrc,
    skipBackSeconds,
    skipForwardSeconds,
  });
  return (
    <>
      <div {...stylex.props(styles.header)}>
        {artworkSrc != null ? (
          <img src={artworkSrc} alt="" {...stylex.props(styles.artwork)} />
        ) : null}
        <div {...stylex.props(styles.titles)}>
          <span {...stylex.props(styles.title)}>{title}</span>
          {subtitle != null ? (
            <span {...stylex.props(styles.subtitle)}>{subtitle}</span>
          ) : null}
        </div>
      </div>
      <MediaTimeSlider />
      <div dir="ltr" {...stylex.props(styles.times)}>
        <MediaTime display="current" xstyle={styles.secondaryTime} />
        <MediaTime display="remaining" xstyle={styles.secondaryTime} />
      </div>
      <div dir="ltr" {...stylex.props(styles.controls)}>
        <MediaPlaybackRateButton xstyle={styles.controlsStart} />
        <MediaSeekButton offset={-skipBackSeconds} />
        <MediaPlayButton size="lg" variant="primary" />
        <MediaSeekButton offset={skipForwardSeconds} />
        <MediaMuteButton xstyle={styles.controlsEnd} />
      </div>
    </>
  );
}

/**
 * A ready-made audio player for episodes, recordings, and music: title and
 * artwork, a timeline, skip back and forward, playback speed, and mute. It
 * follows the page theme. Queues and playlists belong to the product.
 */
export function AudioPlayer({
  src,
  title,
  subtitle,
  artworkSrc,
  label,
  skipBackSeconds = 15,
  skipForwardSeconds = 30,
  preload = 'metadata',
  crossOrigin,
  xstyle,
  ...rest
}: AudioPlayerProps) {
  return (
    <MediaPlayer
      {...rest}
      label={label ?? title}
      xstyle={[styles.root, xstyle]}>
      <MediaPlayerAudio src={src} preload={preload} crossOrigin={crossOrigin} />
      <AudioPlayerLayout
        title={title}
        subtitle={subtitle}
        artworkSrc={artworkSrc}
        skipBackSeconds={skipBackSeconds}
        skipForwardSeconds={skipForwardSeconds}
      />
    </MediaPlayer>
  );
}

AudioPlayer.displayName = 'AudioPlayer';
