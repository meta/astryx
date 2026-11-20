// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ChatSendButton} from '@astryxdesign/core/Chat';
import {Icon} from '@astryxdesign/core/Icon';
import {Stack} from '@astryxdesign/core/Layout';
import {SparklesIcon} from '@astryxdesign/template-icons/24/solid';

export default function ChatSendButtonShowcase() {
  return (
    <Stack direction="horizontal" gap={3} vAlign="center">
      <ChatSendButton isDisabled={false} onSend={() => {}} />
      <ChatSendButton
        isDisabled={false}
        onSend={() => {}}
        sendIcon={<Icon icon={SparklesIcon} size="sm" />}
      />
      <ChatSendButton isStopShown onStop={() => {}} />
    </Stack>
  );
}
