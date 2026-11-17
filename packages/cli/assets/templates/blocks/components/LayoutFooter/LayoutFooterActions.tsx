// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {
  Layout,
  LayoutContent,
  LayoutFooter,
  Card,
  HStack,
} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Button} from '@astryxdesign/core/Button';
import {useToast} from '@astryxdesign/core/Toast';

export default function LayoutFooterActions() {
  const showToast = useToast();
  return (
    <Center width={400} maxWidth="100%">
      <Layout
        style={{width: '100%'}}
        height="fill"
        content={
          <LayoutContent>
            <Card variant="muted" />
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} hAlign="end">
              <Button
                onClick={() =>
                  showToast({
                    body: 'Demo: your changes would be discarded here',
                  })
                }
                label="Cancel"
                variant="secondary">
                Cancel
              </Button>
              <Button
                onClick={() =>
                  showToast({body: 'Demo: your changes would be saved here'})
                }
                label="Save"
                variant="primary">
                Save
              </Button>
            </HStack>
          </LayoutFooter>
        }
      />
    </Center>
  );
}
