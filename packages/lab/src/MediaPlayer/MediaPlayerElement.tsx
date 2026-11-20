// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MediaPlayerElement.tsx
 * @input `kind`, native video or audio attributes (src, poster, preload,
 *   tracks or sources as children), and style props
 * @output Exports MediaPlayerElement, the native media element a MediaPlayer
 *   reads its state from
 * @position Lab media part; render one inside a MediaPlayer
 */

import {
  useCallback,
  type AudioHTMLAttributes,
  type ReactNode,
  type Ref,
  type VideoHTMLAttributes,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '@astryxdesign/core';
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

type VideoAttributes = Pick<
  VideoHTMLAttributes<HTMLVideoElement>,
  | 'src'
  | 'poster'
  | 'preload'
  | 'crossOrigin'
  | 'autoPlay'
  | 'muted'
  | 'loop'
  | 'playsInline'
  | 'width'
  | 'height'
  | 'disablePictureInPicture'
  | 'disableRemotePlayback'
>;

type AudioAttributes = Pick<
  AudioHTMLAttributes<HTMLAudioElement>,
  'src' | 'preload' | 'crossOrigin' | 'autoPlay' | 'muted' | 'loop'
>;

/** A video element. */
export interface MediaPlayerVideoElementProps
  extends BaseProps<HTMLVideoElement>, VideoAttributes {
  /** Renders a `<video>`. */
  kind: 'video';
  /** Caption and subtitle `<track>` elements, or `<source>` elements. */
  children?: ReactNode;
  /** Ref to the video element. */
  ref?: Ref<HTMLVideoElement>;
}

/** An audio element. */
export interface MediaPlayerAudioElementProps
  extends BaseProps<HTMLAudioElement>, AudioAttributes {
  /** Renders an `<audio>`. */
  kind: 'audio';
  /** `<source>` elements for alternative formats. */
  children?: ReactNode;
  /** Ref to the audio element. */
  ref?: Ref<HTMLAudioElement>;
}

export type MediaPlayerElementProps =
  MediaPlayerVideoElementProps | MediaPlayerAudioElementProps;

function useAttachMedia() {
  const {store} = useMediaPlayerContext('MediaPlayerElement');
  return useCallback(
    (element: HTMLMediaElement | null) => {
      store.attachMedia(element);
    },
    [store],
  );
}

function VideoElement({
  kind,
  xstyle,
  className,
  style,
  ref,
  children,
  playsInline = true,
  ...rest
}: MediaPlayerVideoElementProps) {
  const mergedRef = useMergedRefs(ref, useAttachMedia());
  return (
    <video
      {...rest}
      ref={mergedRef}
      controls={false}
      playsInline={playsInline}
      {...mergeProps(
        themeProps('media-player-element', {kind}),
        stylex.props(styles.video, xstyle),
        className,
        style,
      )}>
      {children}
    </video>
  );
}

function AudioElement({
  kind,
  xstyle,
  className,
  style,
  ref,
  children,
  ...rest
}: MediaPlayerAudioElementProps) {
  const mergedRef = useMergedRefs(ref, useAttachMedia());
  return (
    <audio
      {...rest}
      ref={mergedRef}
      controls={false}
      {...mergeProps(
        themeProps('media-player-element', {kind}),
        stylex.props(xstyle),
        className,
        style,
      )}>
      {children}
    </audio>
  );
}

/**
 * The native media element of a MediaPlayer: a `<video>` or an `<audio>`, by
 * `kind`. The browser's own controls stay off; the player's control parts
 * drive it. A video fills its box and takes caption tracks as `<track>`
 * children; an audio element renders nothing visible.
 *
 * @example
 * ```
 * <MediaPlayer label="Product tour">
 *   <MediaPlayerElement kind="video" src="/media/tour.mp4" poster="/media/tour.jpg">
 *     <track kind="captions" src="/media/tour.en.vtt" srcLang="en" label="English" />
 *   </MediaPlayerElement>
 *   <MediaPlayButton />
 * </MediaPlayer>
 * ```
 *
 * @example
 * ```
 * <MediaPlayer label="Episode 12">
 *   <MediaPlayerElement kind="audio" src="/media/episode-12.mp3" />
 *   <MediaPlayButton />
 * </MediaPlayer>
 * ```
 */
export function MediaPlayerElement(props: MediaPlayerElementProps) {
  return props.kind === 'video' ? (
    <VideoElement {...props} />
  ) : (
    <AudioElement {...props} />
  );
}

MediaPlayerElement.displayName = 'MediaPlayerElement';
