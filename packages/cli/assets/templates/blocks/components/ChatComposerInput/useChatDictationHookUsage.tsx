// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {
  ChatComposerInput,
  useChatDictation,
  type ChatComposerInputHandle,
} from '@astryxdesign/core/Chat';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export default function UseChatDictationHookUsage() {
  const inputRef = useRef<ChatComposerInputHandle>(null);
  const dictation = useChatDictation({
    inputRef,
    lang: 'en-US',
  });
  const status = !dictation.isSupported
    ? 'This browser has no speech recognition'
    : dictation.isListening
      ? 'Listening'
      : 'Ready';

  return (
    <VStack gap={3} align="start" width="100%">
      <Text type="body">{status}</Text>
      <Text type="body" color="secondary">
        {dictation.interimTranscript || 'No words yet'}
      </Text>
      <ChatComposerInput handleRef={inputRef} label="Message" />
      <Button
        label={dictation.isListening ? 'Stop' : 'Start'}
        variant="secondary"
        isDisabled={!dictation.isSupported}
        onClick={dictation.toggle}
      />
    </VStack>
  );
}
