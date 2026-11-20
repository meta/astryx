// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  Layout,
  LayoutContent,
  LayoutHeader,
  Card,
  VStack,
} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Text, Heading} from '@astryxdesign/core/Text';

export default function LayoutContentBasic() {
  return (
    <Center width={400} maxWidth="100%">
      <Layout
        style={{width: '100%'}}
        height="fill"
        header={
          <LayoutHeader hasDivider>
            <Card variant="muted" />
          </LayoutHeader>
        }
        content={
          <LayoutContent role="main">
            <VStack gap={3}>
              <Heading level={5}>Main Content</Heading>
              <Text type="body" color="secondary">
                LayoutContent fills the remaining space and scrolls when its
                content overflows, while the header stays fixed.
              </Text>
            </VStack>
          </LayoutContent>
        }
      />
    </Center>
  );
}
