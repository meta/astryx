// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';

const COLUMNS = [
  {
    label: 'Recently opened',
    files: [
      {id: 'brief', title: 'Q3 launch brief', meta: 'Edited 2 days ago'},
      {id: 'pricing', title: 'Pricing rework', meta: 'Edited 3 days ago'},
      {
        id: 'onboarding',
        title: 'Onboarding flow v4',
        meta: 'Edited 4 days ago',
      },
      {id: 'macros', title: 'Support macros', meta: 'Edited last week'},
    ],
  },
  {
    label: 'Shared with you',
    files: [
      {id: 'brand', title: 'Brand refresh', meta: 'Priya Raman'},
      {id: 'checkout', title: 'Checkout audit', meta: 'Tomas Lindqvist'},
      {id: 'partner', title: 'Partner deck', meta: 'Ines Okafor'},
      {id: 'research', title: 'Research synthesis', meta: 'Mei Watanabe'},
    ],
  },
  {
    label: 'Templates',
    files: [
      {id: 'weekly', title: 'Weekly report', meta: 'Used 24 times'},
      {id: 'checklist', title: 'Launch checklist', meta: 'Used 18 times'},
      {id: 'review', title: 'Design review', meta: 'Used 11 times'},
      {id: 'retro', title: 'Retro board', meta: 'Used 9 times'},
    ],
  },
  {
    label: 'Archived',
    files: [
      {id: 'roadmap', title: '2025 roadmap', meta: 'Archived in March'},
      {id: 'legacy', title: 'Legacy pricing', meta: 'Archived in March'},
      {id: 'kit', title: 'Old brand kit', meta: 'Archived in January'},
      {id: 'beta', title: 'Beta feedback', meta: 'Archived in January'},
    ],
  },
];

export default function ScrollableAreaTwoAxisBoard() {
  return (
    <Card width={420} padding={0}>
      {/* axis="both" gives the content box max-content inline sizing, so the
          board is free to be wider than the viewport on both axes. The
          heading is inside that box and travels with it. */}
      <ScrollableArea
        axis="both"
        role="region"
        label="Workspace board"
        height={300}
        padding={4}>
        <VStack gap={4}>
          <VStack gap={0.5}>
            <Heading level={3}>Workspace board</Heading>
            <Text type="supporting">16 files across 4 sections</Text>
          </VStack>
          <HStack gap={3} vAlign="start">
            {COLUMNS.map(column => (
              <VStack key={column.label} gap={2} width={180}>
                <Text type="label" color="secondary">
                  {column.label}
                </Text>
                {column.files.map(file => (
                  <Card key={file.id} variant="muted" padding={3}>
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
              </VStack>
            ))}
          </HStack>
        </VStack>
      </ScrollableArea>
    </Card>
  );
}
