// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  ChatMessageList,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageMetadata,
} from '@astryxdesign/core/Chat';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {
  ClipboardIcon,
  RefreshIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
} from '@astryxdesign/template-icons';
import {useToast} from '@astryxdesign/core/Toast';
import {useClipboard} from '@astryxdesign/core/hooks';

const MESSAGE =
  'The canary at 11:42 AM caused a memory spike. Rolled back at 11:58 AM.';

export default function ChatMessageMetadataShowcase() {
  const showToast = useToast();
  const {copy} = useClipboard();
  return (
    <VStack style={{maxWidth: 600}}>
      <ChatMessageList>
        <ChatMessage sender="assistant">
          <ChatMessageBubble
            metadata={
              <ChatMessageMetadata
                timestamp={
                  <Timestamp value="2026-03-15T14:30:00" format="time" />
                }
                status="error"
                footer={
                  <HStack gap={1}>
                    <Button
                      label="Retry"
                      variant="ghost"
                      size="sm"
                      icon={<Icon icon={RefreshIcon} size="sm" />}
                      isIconOnly
                      onClick={() =>
                        showToast({
                          body: 'Demo: the answer would be generated again here',
                        })
                      }
                    />
                  </HStack>
                }
              />
            }>
            Sorry, something went wrong on my end.
          </ChatMessageBubble>
        </ChatMessage>

        <ChatMessage sender="user">
          <ChatMessageBubble
            metadata={
              <ChatMessageMetadata
                timestamp={
                  <Timestamp value="2026-03-15T14:31:00" format="time" />
                }
                status="read"
              />
            }>
            No worries — try again with just the last 24 hours of logs.
          </ChatMessageBubble>
        </ChatMessage>

        <ChatMessage sender="assistant">
          <ChatMessageBubble
            metadata={
              <ChatMessageMetadata
                timestamp={
                  <Timestamp value="2026-03-15T14:32:00" format="time" />
                }
                footer={
                  <HStack gap={1}>
                    <Button
                      label="Copy"
                      variant="ghost"
                      size="sm"
                      icon={<Icon icon={ClipboardIcon} size="sm" />}
                      isIconOnly
                      onClick={() =>
                        void copy(MESSAGE).then(copied =>
                          showToast({
                            body: copied ? 'Copied' : 'Could not copy',
                          }),
                        )
                      }
                    />
                    <Button
                      label="Retry"
                      variant="ghost"
                      size="sm"
                      icon={<Icon icon={RefreshIcon} size="sm" />}
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
                      icon={<Icon icon={ThumbsUpIcon} size="sm" />}
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
                      icon={<Icon icon={ThumbsDownIcon} size="sm" />}
                      isIconOnly
                      onClick={() =>
                        showToast({
                          body: 'Demo: your thumbs-down would be sent here',
                        })
                      }
                    />
                    <Text type="supporting" color="secondary">
                      Claude Opus 4.6
                    </Text>
                  </HStack>
                }
              />
            }>
            {MESSAGE}
          </ChatMessageBubble>
        </ChatMessage>
      </ChatMessageList>
    </VStack>
  );
}
