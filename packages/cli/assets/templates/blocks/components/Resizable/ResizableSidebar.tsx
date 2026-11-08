// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useResizable, ResizeHandle} from '@astryxdesign/core/Resizable';
import {
  Card,
  Layout,
  LayoutContent,
  LayoutPanel,
  VStack,
} from '@astryxdesign/core/Layout';
import {Button} from '@astryxdesign/core/Button';
import {Text} from '@astryxdesign/core/Text';

export default function ResizableSidebar() {
  const sidebar = useResizable({
    defaultSize: 240,
    minSize: 160,
    maxSize: 360,
    collapsible: true,
    snaps: [200, 280],
  });

  return (
    <Card variant="muted" height={240} width={500}>
      <Layout
        height="fill"
        start={
          <>
            <LayoutPanel width={sidebar.size} hasDivider={false}>
              <Text color="secondary">
                {sidebar.isCollapsed
                  ? ''
                  : `${Math.round(sidebar.size)}px wide`}
              </Text>
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
              <Text color="secondary">
                Drag the handle — it snaps at 200px and 280px. Drag all the way
                left to collapse the sidebar.
              </Text>
              {sidebar.isCollapsed && (
                <Button
                  label="Expand sidebar"
                  variant="secondary"
                  size="sm"
                  onClick={() => sidebar.expand()}
                />
              )}
            </VStack>
          </LayoutContent>
        }
      />
    </Card>
  );
}
