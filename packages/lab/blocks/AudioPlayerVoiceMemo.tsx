// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @input A CC0 sample recording
 * @output An AudioPlayer with short skip intervals for a voice memo
 * @position Lab AudioPlayer docsite example and copyable CLI block
 */

import {VStack} from '@astryxdesign/core/Layout';
import {AudioPlayer} from '@astryxdesign/lab';

export default function AudioPlayerVoiceMemo() {
  return (
    <VStack width={420} maxWidth="100%">
      <AudioPlayer
        src="https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3"
        title="Voice memo"
        skipBackSeconds={5}
        skipForwardSeconds={10}
      />
    </VStack>
  );
}
