// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input A CC0 sample recording and episode details
 * @output An AudioPlayer with skip, speed, and volume controls
 * @position Lab AudioPlayer's docsite showcase and copyable CLI block
 */

import {VStack} from '@astryxdesign/core/Layout';
import {AudioPlayer} from '@astryxdesign/lab';

export default function AudioPlayerShowcase() {
  return (
    <VStack width={560} maxWidth="100%">
      <AudioPlayer
        src="https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3"
        title="Designing for every screen"
        subtitle="The Interface Show · Episode 12"
      />
    </VStack>
  );
}
