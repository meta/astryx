// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
  HStack,
} from '@astryxdesign/core/Layout';
import {Card} from '@astryxdesign/core/Card';
import {Button} from '@astryxdesign/core/Button';
import {Section} from '@astryxdesign/core/Section';
import {Heading, Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';

export default function LayoutFullBleedContent() {
  const showToast = useToast();
  return (
    <Card width="100%" style={{maxWidth: 400}}>
      <Layout
        header={
          <LayoutHeader hasDivider>
            <Heading level={4}>Full Bleed Example</Heading>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            <Section variant="muted">
              <Text type="body">
                Section automatically escapes the parent container padding to
                fill edge-to-edge. Useful for wash backgrounds, tables, or
                images that need to span the full width.
              </Text>
            </Section>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} hAlign="end">
              <Button
                label="Close"
                variant="secondary"
                onClick={() =>
                  showToast({body: 'Demo: this view would close here'})
                }>
                Close
              </Button>
            </HStack>
          </LayoutFooter>
        }
      />
    </Card>
  );
}
