// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Token} from '@astryxdesign/core/Token';

export default function StackDirections() {
  return (
    <HStack gap={10} hAlign="center" wrap="wrap">
      <HStack gap={2} vAlign="center">
        <Token label="Horizontal" />
        <Token label="Horizontal" />
        <Token label="Horizontal" />
      </HStack>
      <VStack gap={2}>
        <Token label="Vertical" />
        <Token label="Vertical" />
        <Token label="Vertical" />
      </VStack>
    </HStack>
  );
}
