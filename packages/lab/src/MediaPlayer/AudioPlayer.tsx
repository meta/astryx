// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file AudioPlayer.tsx
 * @input An audio source, a title with optional subtitle and artwork, skip
 *   intervals, playback options, and root style props
 * @output Exports AudioPlayer, a ready-made player for spoken audio and music
 *   with skip, speed, volume, and system media controls
 * @position Lab media preset; composes MediaPlayer with its audio and control
 *   parts inside a Section container
 */

import {useEffect} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useContainerReveal} from '@astryxdesign/core/hooks';
import {Section} from '@astryxdesign/core/Section';
import {
  colorVars,
  durationVars,
  easeVars,
  fontWeightVars,
  radiusVars,
  spacingVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {mergeProps} from '@astryxdesign/core/utils';
import {MediaPlayer, type MediaPlayerProps} from './MediaPlayer';
import {useMediaPlayerContext} from './MediaPlayerContext';
import {
  MediaMuteButton,
  MediaPlayButton,
  MediaPlaybackRateButton,
  MediaPlaybackRateSlider,
  MediaSeekButton,
  MediaTime,
  MediaTimeSlider,
  MediaVolumeSlider,
} from './MediaPlayerControls';
import {MediaPlayerAudio} from './MediaPlayerMedia';

const styles = stylex.create({
  player: {
    containerType: 'inline-size',
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
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
  speed: {
    justifySelf: 'start',
    display: 'grid',
    alignItems: 'center',
    // The slider's column opens while the speed control is hovered or holds
    // focus, and stays open on touch, matching the container reveal.
    gridTemplateColumns: {
      default: 'auto 0fr',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': 'auto 1fr',
      },
      ':focus-within': 'auto 1fr',
      '@media (any-pointer: coarse)': 'auto 1fr',
    },
    transitionProperty: 'grid-template-columns',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  volume: {
    justifySelf: 'end',
    display: 'grid',
    alignItems: 'center',
    // The slider's column opens while the volume control is hovered or holds
    // focus, and stays open on touch, matching the container reveal.
    gridTemplateColumns: {
      default: '0fr auto',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': '1fr auto',
      },
      ':focus-within': '1fr auto',
      '@media (any-pointer: coarse)': '1fr auto',
    },
    transitionProperty: 'grid-template-columns',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  revealSlot: {
    minWidth: 0,
    overflow: 'clip',
    overflowClipMargin: spacingVars['--spacing-1'],
    // Narrow players keep the buttons and drop the sliders.
    display: {
      default: 'block',
      '@container (max-width: 480px)': 'none',
    },
  },
  speedGap: {
    paddingInlineStart: spacingVars['--spacing-2'],
  },
  // The gap sits inside the opening column, so it closes with the slider.
  volumeGap: {
    paddingInlineEnd: spacingVars['--spacing-2'],
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
    let metadata: MediaMetadata | null = null;
    const claim = () => {
      metadata = new MediaMetadata({
        title,
        artist: subtitle ?? '',
        artwork: artworkSrc != null ? [{src: artworkSrc}] : [],
      });
      session.metadata = metadata;
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
    // Another player that claims the session afterwards owns it from then on.
    const isOwner = () => metadata != null && session.metadata === metadata;
    const unsubscribe = store.subscribe(() => {
      const state = store.getState();
      if (!state.isPaused && !isOwner()) {
        claim();
      }
      if (isOwner()) {
        session.playbackState = state.isPaused ? 'paused' : 'playing';
      }
    });
    return () => {
      unsubscribe();
      if (isOwner()) {
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
  const reveal = useContainerReveal();
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
        {/* The slider opens to the right, so the speed button stays put. */}
        <div
          {...mergeProps(
            reveal.getContainerProps(),
            stylex.props(styles.speed),
          )}>
          <MediaPlaybackRateButton />
          <span
            {...mergeProps(
              reveal.getContentRevealProps({isLayoutPreserved: true}),
              stylex.props(styles.revealSlot),
            )}>
            <MediaPlaybackRateSlider xstyle={styles.speedGap} />
          </span>
        </div>
        <MediaSeekButton offset={-skipBackSeconds} />
        <MediaPlayButton size="lg" variant="primary" />
        <MediaSeekButton offset={skipForwardSeconds} />
        {/* The slider opens toward the center, so Mute keeps its place. */}
        <div
          {...mergeProps(
            reveal.getContainerProps(),
            stylex.props(styles.volume),
          )}>
          <span
            {...mergeProps(
              reveal.getContentRevealProps({isLayoutPreserved: true}),
              stylex.props(styles.revealSlot),
            )}>
            <MediaVolumeSlider width={72} xstyle={styles.volumeGap} />
          </span>
          <MediaMuteButton />
        </div>
      </div>
    </>
  );
}

/**
 * A ready-made audio player for episodes, recordings, and music: title and
 * artwork, a timeline, skip back and forward, playback speed, and volume.
 * It sits in a Section container, so its background and padding follow the
 * theme. Queues and playlists belong to the product.
 *
 * @example
 * ```
 * <AudioPlayer
 *   src="/media/episode-12.mp3"
 *   title="Designing for every screen"
 *   subtitle="The Interface Show · Episode 12"
 * />
 * ```
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
  className,
  style,
  ...rest
}: AudioPlayerProps) {
  return (
    <Section xstyle={xstyle} className={className} style={style}>
      <MediaPlayer {...rest} label={label ?? title} xstyle={styles.player}>
        <MediaPlayerAudio
          src={src}
          preload={preload}
          crossOrigin={crossOrigin}
        />
        <AudioPlayerLayout
          title={title}
          subtitle={subtitle}
          artworkSrc={artworkSrc}
          skipBackSeconds={skipBackSeconds}
          skipForwardSeconds={skipForwardSeconds}
        />
      </MediaPlayer>
    </Section>
  );
}

AudioPlayer.displayName = 'AudioPlayer';
