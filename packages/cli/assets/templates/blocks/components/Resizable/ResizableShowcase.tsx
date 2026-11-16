// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useRef} from 'react';
import {useResizable, ResizeHandle} from '@astryxdesign/core/Resizable';
import {
  Card,
  Layout,
  LayoutContent,
  LayoutPanel,
  VStack,
} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';

export default function ResizableShowcase() {
  // The sidebar's limit is a share of the card, so in a narrow column the
  // resize handle never leaves the card.
  const cardRef = useRef<HTMLDivElement>(null);
  const sidebar = useResizable({
    defaultSize: 200,
    minSize: 120,
    maxSize: '66%',
    containerRef: cardRef,
  });

  return (
    <Card
      ref={cardRef}
      variant="muted"
      height={280}
      width={600}
      maxWidth="100%">
      <Layout
        height="fill"
        start={
          <>
            <LayoutPanel width={sidebar.size} hasDivider={false}>
              <VStack gap={2}>
                <Heading level={4}>Sidebar</Heading>
                <Text color="secondary">{Math.round(sidebar.size)}px wide</Text>
              </VStack>
            </LayoutPanel>
            <ResizeHandle
              direction="horizontal"
              hasDivider
              resizable={sidebar.props}
              label="Resize sidebar"
            />
          </>
        }
        content={
          <LayoutContent>
            <VStack gap={2}>
              <Heading level={4}>Content</Heading>
              <Text color="secondary">
                Drag the handle to resize the sidebar.
              </Text>
            </VStack>
          </LayoutContent>
        }
      />
    </Card>
  );
}
