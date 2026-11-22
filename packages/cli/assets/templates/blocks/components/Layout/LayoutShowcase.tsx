// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
  LayoutPanel,
  HStack,
  VStack,
} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Badge} from '@astryxdesign/core/Badge';
import {List, ListItem} from '@astryxdesign/core/List';
import {useToast} from '@astryxdesign/core/Toast';

export default function LayoutShowcase() {
  const showToast = useToast();
  return (
    <Section padding={4}>
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider>
            <HStack gap={2} vAlign="center">
              <Heading level={4}>Projects</Heading>
              <Badge variant="info" label="3 active" />
            </HStack>
          </LayoutHeader>
        }
        start={
          <LayoutPanel hasDivider width={140}>
            <List>
              <ListItem label="Dashboard" isSelected />
              <ListItem label="Analytics" />
              <ListItem label="Settings" />
            </List>
          </LayoutPanel>
        }
        content={
          <LayoutContent>
            <VStack gap={2}>
              <Heading level={5}>Welcome back</Heading>
              <Text type="body" color="secondary">
                You have 3 active projects and 2 pending reviews.
              </Text>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} hAlign="end">
              <Button
                label="New Project"
                variant="primary"
                onClick={() =>
                  showToast({body: 'Demo: a new project would be created here'})
                }>
                New Project
              </Button>
            </HStack>
          </LayoutFooter>
        }
      />
    </Section>
  );
}
