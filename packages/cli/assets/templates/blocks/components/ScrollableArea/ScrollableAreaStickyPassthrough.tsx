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

const SHARED = [
  {id: 'brand', title: 'Brand refresh', meta: 'Priya Raman'},
  {id: 'checkout', title: 'Checkout audit', meta: 'Tomas Lindqvist'},
  {id: 'partner', title: 'Partner deck', meta: 'Ines Okafor'},
  {id: 'research', title: 'Research synthesis', meta: 'Mei Watanabe'},
  {id: 'tax', title: 'Tax region notes', meta: 'Hugo Bernard'},
  {id: 'sso', title: 'SSO rollout plan', meta: 'Sofia Marchetti'},
];

const TEMPLATES = [
  {id: 'weekly', title: 'Weekly report', meta: 'Used 24 times'},
  {id: 'checklist', title: 'Launch checklist', meta: 'Used 18 times'},
  {id: 'review', title: 'Design review', meta: 'Used 11 times'},
  {id: 'retro', title: 'Retro board', meta: 'Used 9 times'},
  {id: 'brief', title: 'Project brief', meta: 'Used 7 times'},
  {id: 'postmortem', title: 'Postmortem', meta: 'Used 4 times'},
];

const ARCHIVED = [
  {id: 'roadmap', title: '2025 roadmap', meta: 'Archived in March'},
  {id: 'legacy', title: 'Legacy pricing', meta: 'Archived in March'},
  {id: 'kit', title: 'Old brand kit', meta: 'Archived in January'},
  {id: 'beta', title: 'Beta feedback', meta: 'Archived in January'},
  {id: 'survey', title: 'Q4 survey results', meta: 'Archived in January'},
  {id: 'offsite', title: 'Offsite agenda', meta: 'Archived last year'},
];

function FileGrid({
  files,
}: {
  files: Array<{id: string; title: string; meta: string}>;
}) {
  return (
    <Grid columns={2} gap={2}>
      {files.map(file => (
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
  );
}

export default function ScrollableAreaStickyPassthrough() {
  return (
    <Card width={400} padding={0}>
      <ScrollableArea
        axis="block"
        role="region"
        label="Workspace files"
        height={300}
        padding={4}>
        <VStack gap={0.5} paddingBlockEnd={2}>
          <Heading level={3}>Workspace files</Heading>
          <Text type="supporting">18 files across 3 sections</Text>
        </VStack>

        {/* This section's content fits, so its viewport clips instead of
            scrolling and never becomes the Sticky boundary: the label
            passes outward and pins to the panel's edge. */}
        <ScrollableArea axis="block" label="Shared with you">
          <div {...stylex.props(styles.sectionLabel)}>
            <Text type="label" color="secondary">
              Shared with you
            </Text>
          </div>
          <FileGrid files={SHARED} />
        </ScrollableArea>

        {/* Same fitting content, but containment is explicit: this viewport
            stays the Sticky boundary, so its label leaves with the box. */}
        <ScrollableArea
          axis="block"
          label="Templates"
          stickyContainment="always">
          <div {...stylex.props(styles.sectionLabel)}>
            <Text type="label" color="secondary">
              Templates
            </Text>
          </div>
          <FileGrid files={TEMPLATES} />
        </ScrollableArea>

        <div {...stylex.props(styles.sectionLabel)}>
          <Text type="label" color="secondary">
            Archived
          </Text>
        </div>
        <FileGrid files={ARCHIVED} />
      </ScrollableArea>
    </Card>
  );
}
