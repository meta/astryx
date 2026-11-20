// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {HoverCard} from '@astryxdesign/core/HoverCard';
import {Icon} from '@astryxdesign/core/Icon';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {LinkIcon} from '@astryxdesign/template-icons';

export default function HoverCardInteractiveContent() {
  return (
    <Text type="body">
      Read more in the{' '}
      <HoverCard
        placement="below"
        content={
          <VStack gap={2} style={{maxWidth: 280}}>
            <HStack gap={2} vAlign="start">
              <Icon icon={LinkIcon} size="sm" color="secondary" />
              <VStack gap={1}>
                <Text type="label">Getting Started Guide</Text>
                <Text type="body" color="secondary">
                  Learn how to set up your first project, invite team members,
                  and configure your workspace.
                </Text>
                <Text type="supporting" color="secondary">
                  docs.example.com/getting-started
                </Text>
              </VStack>
            </HStack>
          </VStack>
        }>
        <Link href="#" hasUnderline>
          Getting Started Guide
        </Link>
      </HoverCard>
      .
    </Text>
  );
}
