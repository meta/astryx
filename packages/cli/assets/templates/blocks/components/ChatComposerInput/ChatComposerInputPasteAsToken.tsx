// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef} from 'react';
import {
  ChatComposer,
  ChatComposerInput,
  useChatPasteAsToken,
} from '@astryxdesign/core/Chat';
import type {ChatComposerInputHandle} from '@astryxdesign/core/Chat';
import {Stack} from '@astryxdesign/core/Layout';

export default function ChatComposerInputPasteAsToken() {
  const inputRef = useRef<ChatComposerInputHandle>(null);
  const pasteAsToken = useChatPasteAsToken({
    inputRef,
    threshold: 80,
    toToken: text => ({
      value: text,
      label: `Reference · ${text.split(/\s+/).filter(Boolean).length} words`,
      variant: 'info',
    }),
  });

  return (
    <Stack direction="vertical" width={450} maxWidth="100%">
      <ChatComposer
        onSubmit={value => console.log('Submit:', value)}
        input={
          <ChatComposerInput
            handleRef={inputRef}
            pasteAsToken={pasteAsToken}
            placeholder="Paste 81–200 characters for a labeled token..."
          />
        }
      />
    </Stack>
  );
}
