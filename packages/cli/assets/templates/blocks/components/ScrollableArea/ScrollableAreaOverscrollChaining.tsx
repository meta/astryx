// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import * as stylex from '@stylexjs/stylex';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {Card} from '@astryxdesign/core/Card';
import {Grid} from '@astryxdesign/core/Grid';
import {VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {
  borderVars,
  colorVars,
  radiusVars,
} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  // A hairline frame so the nested viewport's edge — the edge the gesture
  // meets — is visible.
  sectionFrame: {
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-element'],
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

export default function ScrollableAreaOverscrollChaining() {
  return (
    <Card width={400} padding={0}>
      <ScrollableArea
        axis="block"
        role="region"
        label="Workspace files"
        height={300}
        padding={4}>
        <VStack gap={4}>
          <VStack gap={0.5}>
            <Heading level={3}>Workspace files</Heading>
            <Text type="supporting">Two sections, two edge policies</Text>
          </VStack>

          <VStack gap={2}>
            <Text type="label" color="secondary">
              Shared with you
            </Text>
            {/* Default overscroll="allow": a gesture that reaches this
                section's end carries on scrolling the panel behind it. */}
            <ScrollableArea
              axis="block"
              label="Shared with you"
              height={150}
              padding={2}
              xstyle={styles.sectionFrame}>
              <FileGrid files={SHARED} />
            </ScrollableArea>
            <Text type="supporting">
              Scroll past the end and the panel keeps going.
            </Text>
          </VStack>

          <VStack gap={2}>
            <Text type="label" color="secondary">
              Archived
            </Text>
            {/* overscroll="contain" stops the gesture at this section's
                edge, so the panel behind it stays put. */}
            <ScrollableArea
              axis="block"
              label="Archived"
              overscroll="contain"
              height={150}
              padding={2}
              xstyle={styles.sectionFrame}>
              <FileGrid files={ARCHIVED} />
            </ScrollableArea>
            <Text type="supporting">
              Scroll past the end and the panel stays where it is.
            </Text>
          </VStack>
        </VStack>
      </ScrollableArea>
    </Card>
  );
}
