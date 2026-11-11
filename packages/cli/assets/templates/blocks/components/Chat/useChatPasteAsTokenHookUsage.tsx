// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef} from 'react';
import {
  ChatComposerInput,
  useChatPasteAsToken,
  type ChatComposerInputHandle,
} from '@astryxdesign/core/Chat';

export default function UseChatPasteAsTokenHookUsage() {
  const inputRef = useRef<ChatComposerInputHandle>(null);
  const pasteAsToken = useChatPasteAsToken({inputRef});

  return (
    <ChatComposerInput
      handleRef={inputRef}
      label="Message"
      pasteAsToken={pasteAsToken}
    />
  );
}
