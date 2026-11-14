// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input A CC0 sample video
 * @output A VideoPlayer with its floating, frosted control bar
 * @position Lab VideoPlayer's docsite showcase and copyable CLI block
 */

import {VStack} from '@astryxdesign/core/Layout';
import {VideoPlayer} from '@astryxdesign/lab';

export default function VideoPlayerShowcase() {
  return (
    <VStack width={640} maxWidth="100%">
      <VideoPlayer
        src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm"
        label="Bee on a flower"
      />
    </VStack>
  );
}
