// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input MediaPlayer presets, root, media and control parts, and the hook
 * @output MediaPlayer module exports
 * @position Public Lab subpath; re-exported by packages/lab/src/index.ts
 */

export {AudioPlayer, type AudioPlayerProps} from './AudioPlayer';
export {MediaPlayer, type MediaPlayerProps} from './MediaPlayer';
export {
  useMediaPlaybackTime,
  useMediaPlayer,
  type UseMediaPlayerResult,
} from './MediaPlayerContext';
export {
  MediaCaptionsButton,
  MediaFullscreenButton,
  MediaPlayButton,
  MediaPlaybackRate,
  MediaSeekButton,
  MediaTime,
  MediaTimeSlider,
  MediaVolume,
  type MediaButtonPartProps,
  type MediaControlSize,
  type MediaPlayButtonProps,
  type MediaPlaybackRateProps,
  type MediaSeekButtonProps,
  type MediaSliderPlacement,
  type MediaTimeProps,
  type MediaTimeSliderProps,
  type MediaTimelineChapter,
  type MediaTimelineMarker,
  type MediaVolumeProps,
} from './MediaPlayerControls';
export {
  MediaPlayerElement,
  type MediaPlayerAudioElementProps,
  type MediaPlayerElementProps,
  type MediaPlayerVideoElementProps,
} from './MediaPlayerElement';
export type {
  MediaPlayerActions,
  MediaPlayerError,
  MediaPlayerState,
  MediaTextTrackInfo,
} from './mediaStore';
export {
  VideoPlayer,
  type VideoPlayerCaptionTrack,
  type VideoPlayerProps,
} from './VideoPlayer';
