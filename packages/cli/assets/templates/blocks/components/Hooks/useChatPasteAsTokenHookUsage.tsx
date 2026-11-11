// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef} from 'react';
import {
  ChatComposer,
  ChatComposerInput,
  useChatPasteAsToken,
} from '@astryxdesign/core/Chat';
import type {ChatComposerInputHandle} from '@astryxdesign/core/Chat';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {useClipboard} from '@astryxdesign/core/hooks';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

const LONG_LOG = [
  '2026-11-11T09:14:02Z INFO  session start (build 2211)',
  '2026-11-11T09:14:03Z WARN  cache dir missing, recreating',
  '2026-11-11T09:14:04Z INFO  14 packages restored',
  '2026-11-11T09:14:05Z ERROR hash mismatch for toolchain archive',
  '2026-11-11T09:14:05Z ERROR retry 1/3 scheduled in 4s',
  '2026-11-11T09:14:09Z INFO  retry succeeded',
  '2026-11-11T09:14:10Z INFO  session ready',
].join('\n');

export default function UseChatPasteAsTokenHookUsage() {
  const inputRef = useRef<ChatComposerInputHandle>(null);
  const {copy, isCopied} = useClipboard({announce: 'Log copied'});
  // Everything at or over 120 characters becomes a chip; shorter pastes
  // insert as ordinary text.
  const {onPaste} = useChatPasteAsToken({inputRef, threshold: 120});

  return (
    <Card padding={4} width={450}>
      <VStack gap={3}>
        <Text type="supporting" color="secondary">
          Copy the build log, then paste into the composer: pastes over 120
          characters arrive as a token chip instead of a wall of text.
        </Text>
        <ChatComposer
          onSubmit={() => {}}
          input={<ChatComposerInput handleRef={inputRef} onPaste={onPaste} />}
        />
        <Button
          label={isCopied ? 'Copied' : 'Copy 7-line log'}
          variant="secondary"
          size="sm"
          onClick={() => void copy(LONG_LOG)}
        />
      </VStack>
    </Card>
  );
}
