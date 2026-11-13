// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {
  ChatComposerInput,
  useChatDictation,
  type ChatComposerInputHandle,
} from '@astryxdesign/core/Chat';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export default function UseChatDictationHookUsage() {
  const inputRef = useRef<ChatComposerInputHandle>(null);
  const dictation = useChatDictation({inputRef});
  const status = !dictation.isSupported
    ? 'This browser has no speech recognition'
    : dictation.isListening
      ? 'Listening'
      : 'Ready';

  return (
    <VStack gap={3} width="100%">
      <Text type="body">{status}</Text>
      <ChatComposerInput handleRef={inputRef} label="Message" />
      <HStack>
        <Button
          label={dictation.isListening ? 'Stop' : 'Start'}
          variant="secondary"
          isDisabled={!dictation.isSupported}
          onClick={dictation.toggle}
        />
      </HStack>
    </VStack>
  );
}
