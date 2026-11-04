// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {useHotkeys} from '@astryxdesign/core/hooks';
import {Kbd} from '@astryxdesign/core/Kbd';
import {
  HStack,
  Layout,
  LayoutContent,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import {Switch} from '@astryxdesign/core/Switch';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';

export default function UseHotkeysHookUsage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  // Single-character shortcuts need an off switch (WCAG 2.1.4).
  const [hasShortcuts, setHasShortcuts] = useState(true);

  useHotkeys([
    {
      keys: '/',
      onPress: () => searchRef.current?.focus(),
      isDisabled: !hasShortcuts,
    },
    {
      keys: '?',
      onPress: () => setIsHelpOpen(true),
      isDisabled: !hasShortcuts,
    },
  ]);

  return (
    <Card width={480} padding={4}>
      <VStack gap={3}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <TextInput
              ref={searchRef}
              label="Search"
              isLabelHidden
              placeholder="Search projects"
              value={query}
              onChange={setQuery}
            />
          </StackItem>
          <Button label="Shortcuts" onClick={() => setIsHelpOpen(true)} />
        </HStack>
        <Switch
          label="Single-key shortcuts"
          value={hasShortcuts}
          onChange={setHasShortcuts}
        />
      </VStack>
      <Dialog isOpen={isHelpOpen} onOpenChange={setIsHelpOpen}>
        <Layout
          header={
            <DialogHeader
              title="Keyboard shortcuts"
              onOpenChange={setIsHelpOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={2}>
                <HStack gap={2} vAlign="center">
                  <Kbd keys="/" />
                  <Text type="body">Focus search</Text>
                </HStack>
                <HStack gap={2} vAlign="center">
                  <Kbd keys="?" />
                  <Text type="body">Show this help</Text>
                </HStack>
              </VStack>
            </LayoutContent>
          }
        />
      </Dialog>
    </Card>
  );
}
