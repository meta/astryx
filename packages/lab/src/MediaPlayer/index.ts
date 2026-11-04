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
export {useMediaPlayer, type UseMediaPlayerResult} from './MediaPlayerContext';
export {
  MediaCaptionsButton,
  MediaFullscreenButton,
  MediaMuteButton,
  MediaPlayButton,
  MediaPlaybackRateButton,
  MediaPlaybackRateMenu,
  MediaPlaybackRateSlider,
  MediaSeekButton,
  MediaTime,
  MediaTimeSlider,
  MediaVolumeSlider,
  type MediaButtonPartProps,
  type MediaControlSize,
  type MediaPlayButtonProps,
  type MediaPlaybackRateButtonProps,
  type MediaPlaybackRateMenuProps,
  type MediaPlaybackRateSliderProps,
  type MediaSeekButtonProps,
  type MediaTimeProps,
  type MediaTimeSliderProps,
  type MediaVolumeSliderProps,
} from './MediaPlayerControls';
export {
  MediaPlayerAudio,
  MediaPlayerVideo,
  type MediaPlayerAudioProps,
  type MediaPlayerVideoProps,
} from './MediaPlayerMedia';
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
