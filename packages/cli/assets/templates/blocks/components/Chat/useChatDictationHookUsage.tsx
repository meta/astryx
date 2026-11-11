// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Button} from '@astryxdesign/core/Button';
import {useChatDictation} from '@astryxdesign/core/Chat';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export default function UseChatDictationHookUsage() {
  const dictation = useChatDictation();
  const status = !dictation.isSupported
    ? 'This browser has no speech recognition'
    : dictation.isListening
      ? 'Listening'
      : 'Ready';

  return (
    <VStack gap={3} align="start">
      <Text type="body">{status}</Text>
      <Button
        label={dictation.isListening ? 'Stop' : 'Start'}
        variant="secondary"
        isDisabled={!dictation.isSupported}
        onClick={dictation.toggle}
      />
    </VStack>
  );
}
