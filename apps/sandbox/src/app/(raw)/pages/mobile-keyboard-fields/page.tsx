// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file page.tsx
 * @position Mobile keyboard fields: an unframed page for checking fields with
 *   a phone's on-screen keyboard. The document itself scrolls, with no inner
 *   scroll box, and the fields sit in the middle of the page.
 * @input TextInput, NumberInput and TextArea
 * @output A tall page with three fields between an intro and a tail
 */

'use client';

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {VStack} from '@astryxdesign/core/Layout';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Heading, Text} from '@astryxdesign/core/Text';
import {TextArea} from '@astryxdesign/core/TextArea';
import {TextInput} from '@astryxdesign/core/TextInput';

const styles = stylex.create({
  intro: {minHeight: '60dvh'},
  tail: {minHeight: '60dvh'},
});

export default function MobileKeyboardFieldsPage() {
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  return (
    <VStack gap={4} padding={4}>
      <VStack gap={2} xstyle={styles.intro}>
        <Heading level={3}>Mobile keyboard</Heading>
        <Text type="supporting" color="secondary">
          Focus a field in the middle of the page, then close the keyboard. The
          page scrolls the field above the keyboard, and back when it closes.
        </Text>
      </VStack>
      <TextInput label="Title" value={title} onChange={setTitle} />
      <NumberInput label="Quantity" value={quantity} onChange={setQuantity} />
      <TextArea label="Notes" value={notes} onChange={setNotes} />
      <VStack xstyle={styles.tail} />
    </VStack>
  );
}
