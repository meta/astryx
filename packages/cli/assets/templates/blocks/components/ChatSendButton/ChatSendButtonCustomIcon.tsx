// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ChatSendButton} from '@astryxdesign/core/Chat';
import {Icon} from '@astryxdesign/core/Icon';
import {Stack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {rtlStyles} from '@astryxdesign/core/utils';
import {
  CheckIcon,
  SendIcon,
  SparklesIcon,
} from '@astryxdesign/template-icons/24/solid';
import {ErrorIcon} from '@astryxdesign/template-icons';

export default function ChatSendButtonCustomIcon() {
  return (
    <Stack direction="vertical" gap={4}>
      <Text type="supporting" color="secondary">
        Custom icons for send and stop states
      </Text>
      <Stack direction="horizontal" gap={4} vAlign="center">
        <ChatSendButton
          isDisabled={false}
          onSend={() => {}}
          sendIcon={
            <Icon icon={SendIcon} size="sm" xstyle={rtlStyles.mirror} />
          }
        />
        <ChatSendButton
          isDisabled={false}
          onSend={() => {}}
          sendIcon={<Icon icon={CheckIcon} size="sm" />}
        />
        <ChatSendButton
          isDisabled={false}
          onSend={() => {}}
          sendIcon={<Icon icon={SparklesIcon} size="sm" />}
        />
        <ChatSendButton
          isStopShown
          onStop={() => {}}
          stopIcon={<Icon icon={ErrorIcon} size="sm" />}
        />
      </Stack>
    </Stack>
  );
}
