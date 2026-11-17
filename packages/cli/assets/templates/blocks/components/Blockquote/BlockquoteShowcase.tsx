// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Blockquote} from '@astryxdesign/core/Blockquote';
import {Stack} from '@astryxdesign/core/Layout';

export default function BlockquoteShowcase() {
  return (
    <Stack direction="vertical" gap={4} style={{width: 500, maxWidth: '100%'}}>
      <Blockquote>
        Design is not just what it looks like and feels like. Design is how it
        works.
      </Blockquote>
      <Blockquote cite="Steve Jobs">
        The people who are crazy enough to think they can change the world are
        the ones who do.
      </Blockquote>
    </Stack>
  );
}
