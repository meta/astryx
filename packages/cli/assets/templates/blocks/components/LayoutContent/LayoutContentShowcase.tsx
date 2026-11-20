// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutFooter,
  LayoutPanel,
  Card,
  VStack,
} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Text, Heading} from '@astryxdesign/core/Text';

export default function LayoutContentShowcase() {
  return (
    <Center width={500} maxWidth="100%">
      <Layout
        style={{width: '100%'}}
        height="fill"
        header={
          <LayoutHeader hasDivider>
            <Card variant="muted" />
          </LayoutHeader>
        }
        start={
          <LayoutPanel hasDivider width={140}>
            <Card variant="muted" />
          </LayoutPanel>
        }
        content={
          <LayoutContent role="main">
            <VStack gap={3}>
              <Heading level={5}>Main Content Area</Heading>
              <Text type="body" color="secondary">
                LayoutContent provides automatic padding and scroll containment.
                It fills the remaining space between the header and footer.
              </Text>
              <Text type="body" color="secondary">
                Content that overflows will scroll within this area while the
                header and footer remain fixed.
              </Text>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <Card variant="muted" />
          </LayoutFooter>
        }
      />
    </Center>
  );
}
