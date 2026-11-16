// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Card} from '@astryxdesign/core/Card';
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
  HStack,
} from '@astryxdesign/core/Layout';
import {Button} from '@astryxdesign/core/Button';
import {Heading, Text} from '@astryxdesign/core/Text';
import {useToast} from '@astryxdesign/core/Toast';

export default function CardWithInnerLayout() {
  const showToast = useToast();
  return (
    <Card width={380}>
      <Layout
        header={
          <LayoutHeader hasDivider>
            <Heading level={3}>Edit Profile</Heading>
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <Text type="body" color="secondary">
              Update your display name, bio, and profile photo. Changes are
              saved immediately.
            </Text>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} hAlign="end">
              <Button
                onClick={() =>
                  showToast({body: 'Demo: your edits would be discarded here'})
                }
                label="Cancel"
                variant="ghost"
              />
              <Button
                onClick={() =>
                  showToast({
                    body: 'Demo: your profile changes would be saved here',
                  })
                }
                label="Save changes"
                variant="primary"
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Card>
  );
}
