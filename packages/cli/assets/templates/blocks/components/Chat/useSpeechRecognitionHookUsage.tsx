// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Button} from '@astryxdesign/core/Button';
import {useSpeechRecognition} from '@astryxdesign/core/Chat';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export default function UseSpeechRecognitionHookUsage() {
  const speech = useSpeechRecognition();
  const status = !speech.isSupported
    ? 'This browser has no speech recognition'
    : speech.isListening
      ? 'Listening'
      : 'Ready';

  return (
    <VStack gap={3} align="start">
      <Text type="body">{status}</Text>
      <Text type="body" color="secondary">
        {speech.interimTranscript || 'No transcript yet'}
      </Text>
      <Button
        label={speech.isListening ? 'Stop' : 'Start'}
        variant="secondary"
        isDisabled={!speech.isSupported}
        onClick={speech.toggle}
      />
    </VStack>
  );
}
