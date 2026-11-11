// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef} from 'react';
import {
  ChatComposer,
  ChatComposerInput,
  ChatDictationButton,
  useChatDictation,
} from '@astryxdesign/core/Chat';
import type {ChatComposerInputHandle} from '@astryxdesign/core/Chat';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export default function UseChatDictationHookUsage() {
  const inputRef = useRef<ChatComposerInputHandle>(null);

  const dictation = useChatDictation({
    inputRef,
    onResult: () => {},
  });

  return (
    <Card padding={4} width={450}>
      <VStack gap={3}>
        <Text type="supporting" color="secondary">
          useChatDictation runs recognition and the meter: interim text shows up
          as ghost text in the input while you speak.
        </Text>
        <ChatComposer
          onSubmit={() => {}}
          input={<ChatComposerInput handleRef={inputRef} />}
          sendActions={<ChatDictationButton dictation={dictation} />}
        />
        {dictation.isListening && (
          <HStack gap={2} vAlign="center">
            <Text type="supporting" color="secondary">
              {dictation.isSpeaking ? 'Speaking detected' : 'Listening...'}
            </Text>
            <div
              style={{
                width: 80,
                height: 6,
                backgroundColor: 'var(--color-surface-secondary)',
                borderRadius: 3,
                overflow: 'hidden',
              }}>
              <div
                style={{
                  height: '100%',
                  backgroundColor: dictation.isSpeaking
                    ? 'var(--color-accent)'
                    : 'var(--color-text-secondary)',
                  borderRadius: 3,
                  transition: 'width 0.08s ease-out',
                  width: `${Math.min(dictation.volume * 200, 100)}%`,
                }}
              />
            </div>
          </HStack>
        )}
        {!dictation.isSupported && (
          <Text type="supporting" color="accent">
            SpeechRecognition is not supported in this browser.
          </Text>
        )}
      </VStack>
    </Card>
  );
}
