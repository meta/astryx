// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs layout/spacing`: hold one content line per region, then
 * tune gaps and density.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'layout-spacing',
  title: 'Layout spacing',
  placement: {parent: 'namespace:layout', slot: 'guides', order: 40},
  category: 'guide',
  description: 'Hold one content line per region, then tune gaps and density.',
  keywords: [
    'alignment',
    'content line',
    'rhythm',
    'gap',
    'density',
    'padding',
    'inset',
    'compact',
    'spacious',
    'FormLayout',
  ],

  sections: [
    {
      id: 'spacing',
      title: 'Spacing',
      content: [
        {
          type: 'prose',
          text: 'Hold one content line per region, then tune gaps and density. Alignment, Rhythm, and Density and size each build on these rules.',
        },
        {
          type: 'list',
          style: 'do',
          items: [
            'Let the container own padding; children zero their own margins',
            'Hold one content line per region: text on the line, hover backgrounds bleed to the edge',
            'Hold one padding token across a region header, body, and footer',
            'Contrast tight and generous gaps so grouping reads without borders',
            'One control size per row; match density to use frequency',
          ],
        },
        {
          type: 'list',
          style: 'dont',
          items: [
            'Double padding: a component indented past its Section heading (keep one inset owner)',
            'Raw px for interior spacing; tokens only, px is for structural widths',
            'One repeated gap everywhere, which flattens grouping',
            'Mixed control sizes in a single row',
          ],
        },
      ],
    },
    {
      id: 'alignment',
      title: 'Alignment',
      content: [
        {
          type: 'prose',
          text: 'The container owns padding and child gaps; children zero their margins, and interior spacing is always a token. Pick one content line per region and hold it constant, not the padding: `container_inset = content_line - component_intrinsic_inset`.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Text and Heading carry no inset, so the container takes the full padding',
            'List, Tab, Menu, and nav items carry a small inset, so the container gives up its padding and the component owns the line',
            'Table cells carry a larger inset, so the container gives up its padding and the cell owns the line',
          ],
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'One content line, two inset owners',
          code: `// Target content line = 16px.
// Heading has 0 inset, so the Section takes the full padding.
<Section padding={4}><Heading level={3}>Members</Heading></Section>

// List has ~8px built in, Table cells 12–16px, so the Section
// gives up its padding and the component owns the inset.
<Section padding={0}><List>{/* items */}</List></Section>`,
        },
        {
          type: 'prose',
          text: 'Verify: draw one vertical line down the left of the region. Every label touches it; only hover and selected backgrounds cross it.',
        },
      ],
    },
    {
      id: 'rhythm',
      title: 'Rhythm',
      content: [
        {
          type: 'prose',
          text: 'Grouping comes from contrast between tight and generous gaps, not one repeated value. If every gap is the same step, proximity does no work.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Tight gaps bind: the smallest steps, used inside an item or field',
            'Generous gaps separate: several steps up, used between sections',
            'Reach for the in-between steps to tune cadence, rather than rounding everything to the same two values',
          ],
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Tight inside, generous between',
          code: `// Tight binds at gap={1}–{2}, generous separates at gap={4}–{6}.
// In-between steps tune cadence: gap={3} = 12px, gap={5} = 20px.
<VStack gap={6}>
  <VStack gap={1}>
    <Text weight="semibold">Retention</Text>
    <Text color="secondary">Logs are kept for 30 days</Text>
  </VStack>
  <VStack gap={1}>{/* next label and value */}</VStack>
</VStack>`,
        },
        {
          type: 'prose',
          text: 'Verify: with every border removed, you can still name the groups from spacing alone. If you cannot, the intervals are too uniform. Form fields are the exception: FormLayout owns their spacing.',
        },
      ],
    },
    {
      id: 'density',
      title: 'Density and size',
      content: [
        {
          type: 'prose',
          text: 'Match density to how often a region is used, and give every control in a row the same size so heights share a baseline.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Compact: high-volume regions scanned fast, like logs, monitors, and large datasets',
            'Balanced: most Table and List surfaces',
            'Spacious: low-frequency or high-stakes rows, like settings or a short selection list',
          ],
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Density paired with control size',
          code: `// Pair density with one control size: compact with sm,
// balanced with sm or md, spacious with md or lg.
<Table data={rows} columns={columns} density="compact" hasHover />
<Button label="Retry" size="sm" variant="ghost" />`,
        },
        {
          type: 'prose',
          text: 'Verify: every interactive element in a row shares one size, and that size is paired with the density of the region it sits in.',
        },
      ],
    },
  ],
};
