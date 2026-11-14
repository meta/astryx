// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {useSpeechRecognition} from '@astryxdesign/core/Chat';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export default function UseSpeechRecognitionHookUsage() {
  const [said, setSaid] = useState('');
  const speech = useSpeechRecognition({
    onResult: transcript => {
      setSaid(current =>
        current === '' ? transcript : `${current} ${transcript}`,
      );
    },
  });
  const status = !speech.isSupported
    ? 'This browser has no speech recognition'
    : speech.isListening
      ? 'Listening'
      : 'Ready';
  const transcript =
    [said, speech.interimTranscript].filter(Boolean).join(' ') ||
    'No transcript yet';

  return (
    <VStack gap={3} align="start">
      <Text type="body">{status}</Text>
      <Text type="body" color="secondary">
        {transcript}
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
