// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {useStreamingText} from '@astryxdesign/core/hooks';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';

const CHUNKS = [
  'Astryx hooks keep behavior reusable ',
  'while components keep visuals consistent. ',
  'Streaming text arrives in bursts; ',
  'the hook smooths it into a steady reveal.',
];

// A fake stream: chunks land in bursts, the way a model streams tokens.
function useFakeStream(onChunk: (chunk: string) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useCallback(() => {
    let index = 0;
    const tick = () => {
      onChunk(CHUNKS[index]);
      index += 1;
      if (index < CHUNKS.length) {
        timer.current = setTimeout(tick, 350);
      } else {
        timer.current = setTimeout(() => {
          timer.current = null;
        }, 350);
      }
    };
    timer.current = setTimeout(tick, 350);
  }, [onChunk]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return start;
}

export default function UseStreamingTextHookUsage() {
  const [target, setTarget] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const appendChunk = useCallback((chunk: string) => {
    setTarget(previous => previous + chunk);
  }, []);
  const startStream = useFakeStream(appendChunk);

  const regenerate = useCallback(() => {
    setTarget('');
    setIsStreaming(true);
    startStream();
    // All chunks have landed after CHUNKS.length ticks: end the stream and
    // let the hook snap to the full text.
    setTimeout(() => setIsStreaming(false), 350 * CHUNKS.length + 100);
  }, [startStream]);

  const displayedText = useStreamingText(target, isStreaming, {speed: 'fast'});

  return (
    <Card width={420} padding={4}>
      <VStack gap={3}>
        <Text type="body" weight="bold">
          Assistant response
        </Text>
        <Text type="body">{displayedText}</Text>
        <Button
          label={isStreaming ? 'Streaming…' : 'Regenerate'}
          variant="secondary"
          size="sm"
          onClick={regenerate}
        />
      </VStack>
    </Card>
  );
}
