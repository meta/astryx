// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';

const SECTIONS = [
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
    label: 'Archived',
    files: [
      {id: 'roadmap', title: '2025 roadmap', meta: 'Archived in March'},
      {id: 'legacy', title: 'Legacy pricing', meta: 'Archived in March'},
      {id: 'kit', title: 'Old brand kit', meta: 'Archived in January'},
      {id: 'beta', title: 'Beta feedback', meta: 'Archived in January'},
    ],
  },
];

export default function ScrollableAreaShowcase() {
  return (
    <Card width={380} padding={0}>
      {/* The heading sits inside the viewport, so it scrolls away with the
          content instead of staying pinned above it. */}
      <ScrollableArea
        axis="block"
        role="region"
        label="Workspace files"
        height={300}
        padding={4}>
        <VStack gap={4}>
          <VStack gap={0.5}>
            <Heading level={3}>Workspace files</Heading>
            <Text type="supporting">12 files across 3 sections</Text>
          </VStack>
          {SECTIONS.map(section => (
            <VStack key={section.label} gap={2}>
              <Text type="label" color="secondary">
                {section.label}
              </Text>
              <Grid columns={2} gap={2}>
                {section.files.map(file => (
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
              </Grid>
            </VStack>
          ))}
        </VStack>
      </ScrollableArea>
    </Card>
  );
}
