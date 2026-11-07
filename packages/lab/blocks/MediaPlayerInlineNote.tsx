// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input A CC0 sample recording
 * @output A compact voice note made of a play button and the time left
 * @position Lab MediaPlayer docsite example and copyable CLI block
 */

import {HStack} from '@astryxdesign/core/Layout';
import {
  MediaPlayButton,
  MediaPlayer,
  MediaPlayerElement,
  MediaTime,
} from '@astryxdesign/lab';

export default function MediaPlayerInlineNote() {
  return (
    <MediaPlayer label="Voice note">
      <MediaPlayerElement
        kind="audio"
        src="https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3"
      />
      <HStack gap={1} vAlign="center">
        <MediaPlayButton size="sm" />
        <MediaTime display="remaining" />
      </HStack>
    </MediaPlayer>
  );
}
