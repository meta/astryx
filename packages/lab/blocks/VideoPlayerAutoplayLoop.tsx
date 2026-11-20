// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input A CC0 sample video
 * @output A muted, looping VideoPlayer that starts on load
 * @position Lab VideoPlayer docsite example and copyable CLI block
 */

import {VStack} from '@astryxdesign/core/Layout';
import {VideoPlayer} from '@astryxdesign/lab';

export default function VideoPlayerAutoplayLoop() {
  return (
    <VStack width={480} maxWidth="100%">
      <VideoPlayer
        src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm"
        label="Bee on a flower"
        hasAutoPlay
        isLooping
      />
    </VStack>
  );
}
