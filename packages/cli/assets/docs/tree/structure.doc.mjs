// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs layout/structure`: rank the content in each region,
 * then pick the weakest container that groups it.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'structure',
  title: 'Structure',
  placement: {parent: 'namespace:layout', slot: 'guides', order: 20},
  category: 'guide',
  description:
    'Rank the content in each region, then pick the weakest container that groups it.',
  keywords: [
    'type hierarchy',
    'Card',
    'Section',
    'Table',
    'List',
    'containers',
    'rows',
    'secondary',
    'Divider',
  ],

  sections: [
    {
      id: 'structure',
      title: 'Structure',
      content: [
        {
          type: 'prose',
          text: 'Rank the content in each region, then pick the weakest container that groups it. Type hierarchy and Card or rows cover each step; these rules hold for all of them.',
        },
        {
          type: 'list',
          style: 'do',
          items: [
            'One lead per region; rank with weight and color; one primary action',
            'Leave body copy at its defaults; demote by weight and color, not size',
            'Default to Section; use the weakest container that reads as a group',
            'Render collections as rows (Table or List), edge-to-edge with dividers',
          ],
        },
        {
          type: 'list',
          style: 'dont',
          items: [
            'Grey and shrink body copy, so a whole region reads as secondary metadata',
            'The disabled color for content; it fails contrast and is for disabled controls',
            'Card soup: each record wrapped in its own Card instead of rendered as rows',
            'Cards inside Cards, or full-width Cards stacked as page structure',
            'Flexbox soup: nested ad-hoc flexboxes instead of Grid, Layout, Section, or FormLayout',
            'Two competing primary actions in one region',
            'Badge as decoration; use StatusDot or Token for status and metadata',
          ],
        },
      ],
    },
    {
      id: 'type-hierarchy',
      title: 'Type hierarchy',
      content: [
        {
          type: 'prose',
          text: 'Give every region one lead, then rank the rest with weight and color rather than size. Content uses two text colors, primary and secondary, and nothing dimmer: body copy needs no props at all.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Body, the default: plain Text with no type, color, or size prop',
            'Lead: Heading at the level matching page depth, or body Text at a heavier weight',
            'Support: step to the secondary color, not to a smaller size',
            'Metadata: the supporting type, or a StatusDot or Token instead of prose',
          ],
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Body copy, then one row of four ranks',
          code: `// Body copy takes no props. Text already defaults to body
// size in the primary color.
<Text>Credentials rotate every 90 days</Text>

<HStack gap={2}>
  <Text weight="semibold">Payments API</Text>
  <StatusDot variant="success" label="Healthy" />
  <Text color="secondary">v2.14</Text>
  <Text type="supporting">edited 3h ago</Text>
</HStack>`,
        },
        {
          type: 'prose',
          text: 'Squint test: blurred, you read lead, then support, then groups, in that order. If everything reads at once, raise contrast with weight and color, not borders and not smaller text.',
        },
      ],
    },
    {
      id: 'containers',
      title: 'Card or rows',
      content: [
        {
          type: 'prose',
          text: 'Reach for the weakest container that reads as a group, and escalate only when it fails. Weakest to strongest:',
        },
        {
          type: 'list',
          style: 'ordered',
          items: [
            'spacing and gap: related items inside one group. The default rhythm',
            'Divider: peers in a dense list or toolbar, or fencing a header from a scrollable body',
            'Section: the default page-structure unit, related content under a heading. No border',
            'Card: a self-contained widget (KPI tile, chart, gallery entry), or a hard boundary around critical content',
          ],
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Section as the default unit',
          code: `// Records are rows in one Section, not one Card each.
// Recommended row height: 32–40px.
<Section padding={0}>
  <List header={<Heading level={3}>Members</Heading>} hasDividers>
    {/* ListItem per member */}
  </List>
</Section>`,
        },
        {
          type: 'prose',
          text: 'Decision test: records render as rows, Table for columnar and List for single-line; a self-contained widget or hard boundary is a Card; everything else is a Section.',
        },
      ],
    },
  ],
};
