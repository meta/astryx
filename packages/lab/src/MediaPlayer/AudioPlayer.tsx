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

import {useEffect, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {AspectRatio} from '@astryxdesign/core/AspectRatio';
import {useTranslator} from '@astryxdesign/core/i18n';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Section} from '@astryxdesign/core/Section';
import {
  colorVars,
  fontWeightVars,
  radiusVars,
  spacingVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {themeProps} from '@astryxdesign/core/utils';
import {MediaPlayer, type MediaPlayerProps} from './MediaPlayer';
import {useMediaPlayerContext} from './MediaPlayerContext';
import {
  MediaPlaybackRate,
  MediaPlayButton,
  MediaSeekButton,
  MediaTime,
  MediaTimeSlider,
  MediaVolume,
  type MediaTimelineChapter,
  type MediaTimelineMarker,
} from './MediaPlayerControls';
import {MediaPlayerElement} from './MediaPlayerElement';
import {useMediaIcon} from './mediaIcons';

/** Height of the artwork, the same as the title and subtitle lines. */
const ARTWORK_HEIGHT = 48;

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
  // The artwork is as tall as the two title lines; its width follows the
  // aspect ratio.
  artwork: (ratio: number) => ({
    flexShrink: 0,
    width: ARTWORK_HEIGHT * ratio,
    overflow: 'hidden',
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-background-muted'],
  }),
  artworkPlaceholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: colorVars['--color-text-secondary'],
    fontSize: 24,
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
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
  },
  transport: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
  },
  speed: {
    justifySelf: 'start',
  },
  volume: {
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
  /**
   * Artwork image URL, such as cover art. The player shows it in front of
   * the title and offers it to the system media controls.
   */
  artworkSrc?: string;
  /**
   * Media in front of the title, such as a video still. It takes the place of
   * `artworkSrc` on screen; `artworkSrc` still goes to the system media
   * controls. Without either, the player shows a generic audio file icon.
   */
  artwork?: ReactNode;
  /** Width divided by height of the artwork. Defaults to 1, a square. */
  artworkAspectRatio?: number;
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
  /**
   * Goes to the previous track in the product's queue. The previous-track
   * control and the matching system media action appear when it is set.
   */
  onPreviousTrack?: () => void;
  /**
   * Goes to the next track in the product's queue. The next-track control
   * and the matching system media action appear when it is set.
   */
  onNextTrack?: () => void;
  /** Chapters, drawn as segments of the timeline and named in its preview. */
  chapters?: readonly MediaTimelineChapter[];
  /** Points of interest, such as timestamped comments, drawn on the timeline. */
  markers?: readonly MediaTimelineMarker[];
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
interface TrackHandlers {
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
}

function useMediaSession({
  title,
  subtitle,
  artworkSrc,
  skipBackSeconds,
  skipForwardSeconds,
  onPreviousTrack,
  onNextTrack,
}: {
  title: string;
  subtitle?: string;
  artworkSrc?: string;
  skipBackSeconds: number;
  skipForwardSeconds: number;
} & TrackHandlers) {
  const {store} = useMediaPlayerContext('AudioPlayer');
  const trackHandlersRef = useRef<TrackHandlers>({});
  const hasPreviousTrack = onPreviousTrack != null;
  const hasNextTrack = onNextTrack != null;
  // Syncs the latest track handlers for the system media actions.
  useEffect(() => {
    trackHandlersRef.current = {onPreviousTrack, onNextTrack};
  });
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
      try {
        session.setActionHandler(
          'previoustrack',
          hasPreviousTrack
            ? () => trackHandlersRef.current.onPreviousTrack?.()
            : null,
        );
        session.setActionHandler(
          'nexttrack',
          hasNextTrack ? () => trackHandlersRef.current.onNextTrack?.() : null,
        );
      } catch {
        // See above.
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
        for (const action of [
          ...SESSION_ACTIONS,
          'previoustrack',
          'nexttrack',
        ] as const) {
          try {
            session.setActionHandler(action, null);
          } catch {
            // See above.
          }
        }
      }
    };
  }, [
    store,
    title,
    subtitle,
    artworkSrc,
    skipBackSeconds,
    skipForwardSeconds,
    hasPreviousTrack,
    hasNextTrack,
  ]);
}

function TrackButton({
  direction,
  onClick,
}: {
  direction: 'previous' | 'next';
  onClick: () => void;
}) {
  const t = useTranslator();
  const icon = useMediaIcon(
    direction === 'previous' ? 'previousTrack' : 'nextTrack',
  );
  const label = t(
    direction === 'previous'
      ? '@astryx.mediaPlayer.previousTrack'
      : '@astryx.mediaPlayer.nextTrack',
  );
  return (
    <IconButton
      label={label}
      tooltip={label}
      icon={icon}
      variant="ghost"
      onClick={onClick}
      {...themeProps('media-track-button')}
    />
  );
}

function AudioArtwork({
  artwork,
  artworkSrc,
  ratio,
}: {
  artwork?: ReactNode;
  artworkSrc?: string;
  ratio: number;
}) {
  const placeholderIcon = useMediaIcon('audioFile');
  return (
    <AspectRatio
      ratio={ratio}
      fit="cover"
      xstyle={styles.artwork(ratio)}
      {...themeProps('media-artwork')}>
      {artwork ??
        (artworkSrc != null ? (
          <img src={artworkSrc} alt="" />
        ) : (
          <span {...stylex.props(styles.artworkPlaceholder)}>
            {placeholderIcon}
          </span>
        ))}
    </AspectRatio>
  );
}

function AudioPlayerLayout({
  title,
  subtitle,
  artworkSrc,
  artwork,
  artworkAspectRatio,
  skipBackSeconds,
  skipForwardSeconds,
  onPreviousTrack,
  onNextTrack,
  chapters,
  markers,
}: TrackHandlers & {
  title: string;
  subtitle?: string;
  artworkSrc?: string;
  artwork?: ReactNode;
  artworkAspectRatio: number;
  skipBackSeconds: number;
  skipForwardSeconds: number;
  chapters?: readonly MediaTimelineChapter[];
  markers?: readonly MediaTimelineMarker[];
}) {
  useMediaSession({
    title,
    subtitle,
    artworkSrc,
    skipBackSeconds,
    skipForwardSeconds,
    onPreviousTrack,
    onNextTrack,
  });
  return (
    <>
      <div {...stylex.props(styles.header)}>
        <AudioArtwork
          artwork={artwork}
          artworkSrc={artworkSrc}
          ratio={artworkAspectRatio}
        />
        <div {...stylex.props(styles.titles)}>
          <span {...stylex.props(styles.title)}>{title}</span>
          {subtitle != null ? (
            <span {...stylex.props(styles.subtitle)}>{subtitle}</span>
          ) : null}
        </div>
      </div>
      <MediaTimeSlider chapters={chapters} markers={markers} />
      <div dir="ltr" {...stylex.props(styles.times)}>
        <MediaTime display="current" xstyle={styles.secondaryTime} />
        <MediaTime display="remaining" xstyle={styles.secondaryTime} />
      </div>
      <div dir="ltr" {...stylex.props(styles.controls)}>
        <MediaPlaybackRate xstyle={styles.speed} />
        <div {...stylex.props(styles.transport)}>
          {onPreviousTrack != null ? (
            <TrackButton direction="previous" onClick={onPreviousTrack} />
          ) : null}
          <MediaSeekButton offset={-skipBackSeconds} />
          <MediaPlayButton size="lg" variant="primary" />
          <MediaSeekButton offset={skipForwardSeconds} />
          {onNextTrack != null ? (
            <TrackButton direction="next" onClick={onNextTrack} />
          ) : null}
        </div>
        <MediaVolume xstyle={styles.volume} />
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
  artwork,
  artworkAspectRatio = 1,
  label,
  skipBackSeconds = 15,
  skipForwardSeconds = 30,
  preload = 'metadata',
  crossOrigin,
  onPreviousTrack,
  onNextTrack,
  chapters,
  markers,
  xstyle,
  className,
  style,
  ...rest
}: AudioPlayerProps) {
  return (
    <Section xstyle={xstyle} className={className} style={style}>
      <MediaPlayer {...rest} label={label ?? title} xstyle={styles.player}>
        <MediaPlayerElement
          kind="audio"
          src={src}
          preload={preload}
          crossOrigin={crossOrigin}
        />
        <AudioPlayerLayout
          title={title}
          subtitle={subtitle}
          artworkSrc={artworkSrc}
          artwork={artwork}
          artworkAspectRatio={artworkAspectRatio}
          skipBackSeconds={skipBackSeconds}
          skipForwardSeconds={skipForwardSeconds}
          onPreviousTrack={onPreviousTrack}
          onNextTrack={onNextTrack}
          chapters={chapters}
          markers={markers}
        />
      </MediaPlayer>
    </Section>
  );
}

AudioPlayer.displayName = 'AudioPlayer';
