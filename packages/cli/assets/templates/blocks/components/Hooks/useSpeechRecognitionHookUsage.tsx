// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {useSpeechRecognition} from '@astryxdesign/core/Chat';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export default function UseSpeechRecognitionHookUsage() {
  const recognition = useSpeechRecognition();

  return (
    <Card padding={4} width={420}>
      <VStack gap={3}>
        <Text type="supporting" color="secondary">
          The headless wrapper: no composer, no button component - your UI calls
          start, stop and reads the transcript.
        </Text>
        <HStack gap={2}>
          <Button
            label={recognition.isListening ? 'Stop' : 'Start'}
            variant={recognition.isListening ? 'secondary' : 'primary'}
            onClick={recognition.toggle}
          />
          {recognition.isListening && (
            <Text type="supporting" color="secondary" alignVertical="center">
              {recognition.isSpeaking ? 'Speaking...' : 'Listening...'}
            </Text>
          )}
        </HStack>
        <Text type="body">
          {recognition.interimTranscript || 'Transcript appears here.'}
        </Text>
        {!recognition.isSupported && (
          <Text type="supporting" color="accent">
            SpeechRecognition is not supported in this browser.
          </Text>
        )}
      </VStack>
    </Card>
  );
}
