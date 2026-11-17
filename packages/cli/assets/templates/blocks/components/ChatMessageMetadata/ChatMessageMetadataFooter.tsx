// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  ChatMessageList,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageMetadata,
} from '@astryxdesign/core/Chat';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Text} from '@astryxdesign/core/Text';
import {HStack} from '@astryxdesign/core/Layout';
import {
  ClipboardDocumentIcon,
  ArrowPathIcon,
  HandThumbUpIcon,
  HandThumbDownIcon,
} from '@heroicons/react/24/outline';
import {useToast} from '@astryxdesign/core/Toast';
import {useClipboard} from '@astryxdesign/core/hooks';

const MESSAGE =
  'Q1 revenue reached $2.4B, up 18% year-over-year. Enterprise subscriptions drove 62% of the growth, while ad revenue held steady at $890M.';

export default function ChatMessageMetadataFooter() {
  const showToast = useToast();
  const {copy} = useClipboard();
  return (
    <ChatMessageList style={{maxWidth: 500}}>
      <ChatMessage sender="user">
        <ChatMessageBubble
          metadata={
            <ChatMessageMetadata
              timestamp={
                <Timestamp value="2026-04-29T09:41:00" format="time" />
              }
              status="read"
            />
          }>
          Summarize the Q1 revenue report.
        </ChatMessageBubble>
      </ChatMessage>
      <ChatMessage sender="assistant">
        <ChatMessageBubble
          metadata={
            <ChatMessageMetadata
              timestamp={
                <Timestamp value="2026-04-29T09:42:00" format="time" />
              }
              footer={
                <HStack gap={1}>
                  <Button
                    label="Copy"
                    variant="ghost"
                    size="sm"
                    icon={<Icon icon={ClipboardDocumentIcon} size="sm" />}
                    isIconOnly
                    onClick={() =>
                      void copy(MESSAGE).then(copied =>
                        showToast({body: copied ? 'Copied' : 'Could not copy'}),
                      )
                    }
                  />
                  <Button
                    label="Retry"
                    variant="ghost"
                    size="sm"
                    icon={<Icon icon={ArrowPathIcon} size="sm" />}
                    isIconOnly
                    onClick={() =>
                      showToast({
                        body: 'Demo: the answer would be generated again here',
                      })
                    }
                  />
                  <Button
                    label="Good response"
                    variant="ghost"
                    size="sm"
                    icon={<Icon icon={HandThumbUpIcon} size="sm" />}
                    isIconOnly
                    onClick={() =>
                      showToast({
                        body: 'Demo: your thumbs-up would be sent here',
                      })
                    }
                  />
                  <Button
                    label="Bad response"
                    variant="ghost"
                    size="sm"
                    icon={<Icon icon={HandThumbDownIcon} size="sm" />}
                    isIconOnly
                    onClick={() =>
                      showToast({
                        body: 'Demo: your thumbs-down would be sent here',
                      })
                    }
                  />
                  <Text type="supporting" color="secondary">
                    GPT-4o
                  </Text>
                </HStack>
              }
            />
          }>
          {MESSAGE}
        </ChatMessageBubble>
      </ChatMessage>
    </ChatMessageList>
  );
}
