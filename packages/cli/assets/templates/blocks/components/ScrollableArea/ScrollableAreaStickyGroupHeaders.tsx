// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import * as stylex from '@stylexjs/stylex';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {colorVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  sectionLabel: {
    position: 'sticky',
    insetBlockStart: 0,
    zIndex: 1,
    backgroundColor: colorVars['--color-background-card'],
    paddingBlock: spacingVars['--spacing-2'],
  },
});

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

export default function ScrollableAreaStickyGroupHeaders() {
  return (
    <Card width={380} padding={0}>
      {/* The viewport is the containing block for position: sticky. The panel
          heading is ordinary content and scrolls away; the section labels
          below it pin to the top of the list, not the page. */}
      <ScrollableArea
        axis="block"
        role="region"
        label="Workspace files"
        height={300}
        padding={4}>
        <VStack gap={0.5} paddingBlockEnd={2}>
          <Heading level={3}>Workspace files</Heading>
          <Text type="supporting">12 files across 3 sections</Text>
        </VStack>
        {SECTIONS.map(section => (
          <section key={section.label}>
            <div {...stylex.props(styles.sectionLabel)}>
              <Text type="label" color="secondary">
                {section.label}
              </Text>
            </div>
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
          </section>
        ))}
      </ScrollableArea>
    </Card>
  );
}
