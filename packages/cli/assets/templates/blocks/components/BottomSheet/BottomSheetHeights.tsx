// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useState} from 'react';
import {
  BottomSheet,
  type BottomSheetHeight,
} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {Divider} from '@astryxdesign/core/Divider';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';

const descriptions: Record<BottomSheetHeight, string> = {
  hug: 'Hug fits short, bounded content.',
  capped: 'Capped starts at a comfortable mid-height for lists and filters.',
  tall: 'Tall reserves most of the viewport for long or changing content.',
};

export default function BottomSheetHeights() {
  const [height, setHeight] = useState<BottomSheetHeight | null>(null);

  return (
    <>
      <HStack gap={2} wrap="wrap">
        <Button label="Open hug" onClick={() => setHeight('hug')} />
        <Button label="Open capped" onClick={() => setHeight('capped')} />
        <Button label="Open tall" onClick={() => setHeight('tall')} />
      </HStack>
      <BottomSheet
        isOpen={height != null}
        onOpenChange={isOpen => !isOpen && setHeight(null)}
        label={`${height ?? 'Hug'} height`}
        height={height ?? 'hug'}>
        <VStack gap={4}>
          <Heading level={3}>{height ?? 'Hug'} height</Heading>
          <Divider />
          <Text type="body">{descriptions[height ?? 'hug']}</Text>
          <Button label="Close" onClick={() => setHeight(null)} />
        </VStack>
      </BottomSheet>
    </>
  );
}
