// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef} from 'react';
import {
  ChatComposerInput,
  useChatPasteAsToken,
  type ChatComposerInputHandle,
  type ChatComposerToken,
} from '@astryxdesign/core/Chat';

function pastedNote(text: string): ChatComposerToken {
  return {value: text, label: 'Pasted note', variant: 'neutral'};
}

export default function UseChatPasteAsTokenHookUsage() {
  const inputRef = useRef<ChatComposerInputHandle>(null);
  const pasteAsToken = useChatPasteAsToken({
    inputRef,
    threshold: 40,
    toToken: pastedNote,
  });

  return (
    <ChatComposerInput
      handleRef={inputRef}
      label="Message"
      pasteAsToken={pasteAsToken}
    />
  );
}
