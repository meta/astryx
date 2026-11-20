// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input A CC0 sample recording
 * @output A custom player layout from the MediaPlayer parts and
 *   useMediaPlayer
 * @position Lab MediaPlayer's docsite showcase and copyable CLI block
 */

import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {
  MediaPlayButton,
  MediaPlayer,
  MediaPlaybackRate,
  MediaPlayerElement,
  MediaTime,
  MediaTimeSlider,
  MediaVolume,
  useMediaPlayer,
} from '@astryxdesign/lab';

function ElapsedPercent() {
  const {state} = useMediaPlayer();
  const percent = state.duration > 0 ? state.currentTime / state.duration : 0;
  return (
    <Text type="supporting" color="secondary">
      {Math.round(percent * 100)}%
    </Text>
  );
}

export default function MediaPlayerShowcase() {
  return (
    <VStack width={560} maxWidth="100%">
      <MediaPlayer label="Recording">
        <MediaPlayerElement
          kind="audio"
          src="https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3"
        />
        <HStack gap={2} vAlign="center">
          <MediaPlayButton variant="primary" />
          <MediaTimeSlider />
          <MediaTime display="remaining" />
          <ElapsedPercent />
          <MediaPlaybackRate variant="menu" />
          <MediaVolume />
        </HStack>
      </MediaPlayer>
    </VStack>
  );
}
