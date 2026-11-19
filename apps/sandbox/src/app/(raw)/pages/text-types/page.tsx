// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file page.tsx
 * @input None
 * @output Every built-in Text type at the default size, one sample per row
 * @position A raw Sandbox page (/pages/text-types/) with no sandbox frame.
 *   The document scrolls, so the browser's own text size reaches each type.
 */

import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import type {BuiltinTextType} from '@astryxdesign/core/theme';

// The record holds every built-in type.
// The typecheck fails when one is missing.
const SHOWN_TYPES: Record<BuiltinTextType, true> = {
  'display-1': true,
  'display-2': true,
  'display-3': true,
  large: true,
  body: true,
  label: true,
  supporting: true,
  code: true,
  inherit: true,
};

const TEXT_TYPES = Object.keys(SHOWN_TYPES) as BuiltinTextType[];

const SAMPLE = 'The quick brown fox jumps over the lazy dog';

export default function TextTypesPage() {
  return (
    <VStack gap={4} padding={4}>
      {TEXT_TYPES.map(type => (
        <Text key={type} type={type}>
          {`${type}: ${SAMPLE}`}
        </Text>
      ))}
    </VStack>
  );
}
