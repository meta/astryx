// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {Heading, Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';
import {VStack} from '@astryxdesign/core/VStack';

const MESSAGES = [
  'Welcome to Orbit',
  'Your invoice is ready',
  'Weekly summary',
];

export default function App() {
  const toast = useToast();
  const [archived, setArchived] = useState<ReadonlySet<string>>(new Set());
  const dismissRef = useRef<(() => void) | null>(null);

  const restore = (title: string) => {
    setArchived(current => {
      const next = new Set(current);
      next.delete(title);
      return next;
    });
    dismissRef.current?.();
    dismissRef.current = null;
  };

  const archive = (title: string) => {
    setArchived(current => new Set(current).add(title));
    dismissRef.current = toast({
      body: 'Message archived',
      isAutoHide: false,
      uniqueID: 'message-archived',
      endContent: (
        <Button label="Undo" size="sm" onClick={() => restore(title)} />
      ),
    });
  };

  return (
    <VStack gap={3} padding={6}>
      <Heading level={1}>Inbox</Heading>
      {MESSAGES.filter(title => !archived.has(title)).map(title => (
        <HStack key={title} gap={2}>
          <Text>{title}</Text>
          <Button label={`Archive ${title}`} onClick={() => archive(title)}>
            Archive
          </Button>
        </HStack>
      ))}
    </VStack>
  );
}
