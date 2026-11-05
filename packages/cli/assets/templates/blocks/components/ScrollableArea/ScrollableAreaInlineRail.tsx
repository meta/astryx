// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Link} from '@astryxdesign/core/Link';

const FILES = [
  {id: 'brief', title: 'Q3 launch brief', meta: 'Edited 2 days ago'},
  {id: 'pricing', title: 'Pricing rework', meta: 'Edited 3 days ago'},
  {id: 'onboarding', title: 'Onboarding flow v4', meta: 'Edited 4 days ago'},
  {id: 'macros', title: 'Support macros', meta: 'Edited last week'},
  {id: 'brand', title: 'Brand refresh', meta: 'Priya Raman'},
  {id: 'checkout', title: 'Checkout audit', meta: 'Tomas Lindqvist'},
  {id: 'partner', title: 'Partner deck', meta: 'Ines Okafor'},
];

export default function ScrollableAreaInlineRail() {
  return (
    <Card width={460} padding={4}>
      <VStack gap={3}>
        <HStack hAlign="between" vAlign="center">
          <VStack gap={0.5}>
            <Heading level={3}>Workspace files</Heading>
            <Text type="supporting">Recently opened</Text>
          </VStack>
          <Link href="#files">View all</Link>
        </HStack>
        {/* isFullBleed lets the rail reach the card's edges, while the content
            padding keeps the first card aligned with the heading above it and
            leaves room under the cards for the scrollbar. */}
        <ScrollableArea
          axis="inline"
          role="region"
          label="Recently opened files"
          isFullBleed
          paddingInline={4}
          paddingBlockStart={0.5}
          paddingBlockEnd={4}>
          <HStack gap={2}>
            {FILES.map(file => (
              <Card key={file.id} variant="muted" padding={3} width={170}>
                <VStack gap={1}>
                  <Text weight="medium" maxLines={1}>
                    {file.title}
                  </Text>
                  <Text type="supporting" maxLines={1}>
                    {file.meta}
                  </Text>
                </VStack>
              </Card>
            ))}
          </HStack>
        </ScrollableArea>
      </VStack>
    </Card>
  );
}
