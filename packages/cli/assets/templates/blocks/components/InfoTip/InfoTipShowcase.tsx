// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {InfoTip} from '@astryxdesign/core/InfoTip';
import {HStack, VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';

export default function InfoTipShowcase() {
  return (
    <VStack gap={1}>
      <HStack gap={1} align="center">
        <Text type="label" color="secondary">
          Rolling average
        </Text>
        <InfoTip
          content="30-day rolling average, recomputed nightly."
          label="About this metric"
        />
      </HStack>
      <Text type="display-3">1,284</Text>
    </VStack>
  );
}
