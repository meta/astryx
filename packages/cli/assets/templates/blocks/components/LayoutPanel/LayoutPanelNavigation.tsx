// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  Layout,
  LayoutPanel,
  LayoutContent,
  Card,
} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {List, ListItem} from '@astryxdesign/core/List';

export default function LayoutPanelNavigation() {
  return (
    <Center width={400} maxWidth="100%">
      <Layout
        style={{width: '100%'}}
        height="fill"
        start={
          <LayoutPanel hasDivider width={140} role="navigation">
            <List>
              <ListItem label="Overview" isSelected />
              <ListItem label="Analytics" />
              <ListItem label="Settings" />
            </List>
          </LayoutPanel>
        }
        content={
          <LayoutContent>
            <Card variant="muted" />
          </LayoutContent>
        }
      />
    </Center>
  );
}
