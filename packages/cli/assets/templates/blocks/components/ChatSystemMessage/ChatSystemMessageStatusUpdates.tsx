// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ChatMessageList, ChatSystemMessage} from '@astryxdesign/core/Chat';
import {Icon} from '@astryxdesign/core/Icon';
import {
  SuccessIcon,
  UserRemoveIcon,
  UserAddIcon,
} from '@astryxdesign/template-icons';

export default function ChatSystemMessageStatusUpdates() {
  return (
    <ChatMessageList>
      <ChatSystemMessage variant="divider">March 14, 2026</ChatSystemMessage>
      <ChatSystemMessage icon={<Icon icon={UserAddIcon} />}>
        Sarah Chen joined the conversation
      </ChatSystemMessage>
      <ChatSystemMessage>
        Topic changed to "Q2 Launch Planning"
      </ChatSystemMessage>
      <ChatSystemMessage variant="divider">March 15, 2026</ChatSystemMessage>
      <ChatSystemMessage icon={<Icon icon={UserRemoveIcon} />}>
        Alex Rivera left the conversation
      </ChatSystemMessage>
      <ChatSystemMessage variant="divider">Today</ChatSystemMessage>
      <ChatSystemMessage icon={<Icon icon={SuccessIcon} />}>
        Conversation marked as resolved
      </ChatSystemMessage>
    </ChatMessageList>
  );
}
