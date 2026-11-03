// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MediaPlayerMedia.tsx
 * @input Native video or audio attributes (src, poster, preload, tracks as
 *   children) and style props
 * @output Exports MediaPlayerVideo and MediaPlayerAudio, the native media
 *   elements a MediaPlayer reads its state from
 * @position Lab media parts; render one inside a MediaPlayer
 */

import {
  useCallback,
  type ComponentProps,
  type CSSProperties,
  type Ref,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {useMergedRefs} from '@astryxdesign/core/hooks';
import {colorVars} from '@astryxdesign/core/theme/tokens.stylex';
import {mergeProps, themeProps} from '@astryxdesign/core/utils';
import {useMediaPlayerContext} from './MediaPlayerContext';

const styles = stylex.create({
  video: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    backgroundColor: colorVars['--color-background-inverted'],
  },
});

type NativeMediaProps<T extends 'video' | 'audio'> = Omit<
  ComponentProps<T>,
  'controls' | 'className' | 'style' | 'ref'
>;

export interface MediaPlayerVideoProps extends NativeMediaProps<'video'> {
  /** StyleX styles for the video element. */
  xstyle?: StyleXStyles;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLVideoElement>;
}

export interface MediaPlayerAudioProps extends NativeMediaProps<'audio'> {
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLAudioElement>;
}

function useAttachMedia<T extends HTMLMediaElement>(part: string) {
  const {store} = useMediaPlayerContext(part);
  return useCallback(
    (element: T | null) => {
      store.attachMedia(element);
    },
    [store],
  );
}

/**
 * The native video element of a MediaPlayer. The browser's own controls stay
 * off; the player's control parts drive it. Pass caption tracks as `<track>`
 * children.
 */
export function MediaPlayerVideo({
  xstyle,
  className,
  style,
  ref,
  children,
  playsInline = true,
  ...rest
}: MediaPlayerVideoProps) {
  const attach = useAttachMedia<HTMLVideoElement>('MediaPlayerVideo');
  const mergedRef = useMergedRefs(ref, attach);
  return (
    <video
      {...rest}
      ref={mergedRef}
      controls={false}
      playsInline={playsInline}
      {...mergeProps(
        themeProps('media-player-video'),
        stylex.props(styles.video, xstyle),
        className,
        style,
      )}>
      {children}
    </video>
  );
}

MediaPlayerVideo.displayName = 'MediaPlayerVideo';

/**
 * The native audio element of a MediaPlayer. It renders nothing visible; the
 * player's control parts drive it.
 */
export function MediaPlayerAudio({
  className,
  style,
  ref,
  children,
  ...rest
}: MediaPlayerAudioProps) {
  const attach = useAttachMedia<HTMLAudioElement>('MediaPlayerAudio');
  const mergedRef = useMergedRefs(ref, attach);
  return (
    <audio
      {...rest}
      ref={mergedRef}
      controls={false}
      {...mergeProps(themeProps('media-player-audio'), className, style)}>
      {children}
    </audio>
  );
}

MediaPlayerAudio.displayName = 'MediaPlayerAudio';
