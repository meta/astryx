// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file page.tsx
 * @output A bare page with a button that opens a BottomSheet of 40 rows, above
 *   rows that make the document scroll
 * @position A raw page, with no sandbox chrome, for checking a sheet's pull on
 *   a phone. The page scrolls with the document; the sheet's rows scroll
 *   inside the sheet.
 */

import {useState} from 'react';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/Layout';
import {List, ListItem} from '@astryxdesign/core/List';
import {Heading, Text} from '@astryxdesign/core/Text';

const SHEET_ROWS = Array.from({length: 40}, (_, index) => `Item ${index + 1}`);
const PAGE_ROWS = Array.from({length: 40}, (_, index) => `Row ${index + 1}`);

export default function BottomSheetPullPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [lastTapped, setLastTapped] = useState<string | null>(null);
  return (
    <VStack gap={4} padding={4}>
      <VStack gap={1}>
        <Heading level={1}>BottomSheet pull</Heading>
        <Text color="secondary">
          Open the sheet, then pull down slowly on its rows while they are
          scrolled to the top.
        </Text>
      </VStack>
      <Button label="Open sheet" onClick={() => setIsOpen(true)} />
      <VStack gap={2}>
        {PAGE_ROWS.map(row => (
          <Text key={row} color="secondary">
            {row}
          </Text>
        ))}
      </VStack>
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        label="Items"
        height="capped">
        <VStack gap={2}>
          <Text color="secondary">
            {lastTapped == null ? 'Tap a row' : `Tapped ${lastTapped}`}
          </Text>
          <List hasDividers>
            {SHEET_ROWS.map(row => (
              <ListItem
                key={row}
                label={row}
                onClick={() => setLastTapped(row)}
              />
            ))}
          </List>
        </VStack>
      </BottomSheet>
    </VStack>
  );
}
