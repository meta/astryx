// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useEffect, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {useFocusTrap} from '@astryxdesign/core/hooks';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';

export default function UseFocusTrapHookUsage() {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('Update onboarding guide');
  const [draft, setDraft] = useState(title);
  const close = () => setIsOpen(false);
  const {containerRef, focusFirst} = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    onEscape: close,
  });

  // Runs after commit, once the panel is mounted and useFocusTrap has recorded
  // the opener, so closing the panel returns focus to it.
  useEffect(() => {
    if (isOpen) {
      focusFirst();
    }
  }, [isOpen, focusFirst]);

  return (
    <HStack gap={4} vAlign="start">
      <VStack gap={2}>
        <Text type="body" weight="bold">
          {title}
        </Text>
        <Button
          label="Quick edit"
          onClick={() => {
            setDraft(title);
            setIsOpen(true);
          }}
        />
      </VStack>
      {isOpen && (
        <Card
          ref={containerRef}
          role="dialog"
          aria-label="Quick edit"
          width={280}
          padding={4}>
          <VStack gap={3}>
            <TextInput label="Title" value={draft} onChange={setDraft} />
            <HStack gap={2} hAlign="end">
              <Button label="Cancel" variant="secondary" onClick={close} />
              <Button
                label="Save"
                variant="primary"
                onClick={() => {
                  setTitle(draft);
                  close();
                }}
              />
            </HStack>
          </VStack>
        </Card>
      )}
    </HStack>
  );
}
