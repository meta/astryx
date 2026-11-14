// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {
  ChatDictationButton,
  useSpeechRecognition,
} from '@astryxdesign/core/Chat';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export default function UseSpeechRecognitionHookUsage() {
  const [committedTranscript, setCommittedTranscript] = useState('');
  const dictation = useSpeechRecognition({
    onResult: setCommittedTranscript,
  });

  return (
    <VStack gap={3} align="start">
      <ChatDictationButton dictation={dictation} />
      <Text type="supporting" color="secondary">
        {dictation.isSupported
          ? dictation.isListening
            ? dictation.interimTranscript || 'Listening…'
            : committedTranscript || 'Tap the microphone to start.'
          : 'Speech recognition is not available in this browser.'}
      </Text>
    </VStack>
  );
}
