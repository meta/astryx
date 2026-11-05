// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs layout/side-panels`: add a master-detail side panel
 * that opens on row select instead of navigating away.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'side-panels',
  title: 'Side panels',
  placement: {parent: 'namespace:layout', slot: 'guides', order: 35},
  category: 'guide',
  description:
    'Add a master-detail side panel that opens on row select instead of navigating away.',
  keywords: [
    'LayoutPanel',
    'side panel',
    'master detail',
    'ResizeHandle',
    'useResizable',
    'EmptyState',
    'isScrollable',
    'detail panel',
    'split view',
  ],

  sections: [
    {
      id: 'side-panels',
      title: 'Side panels',
      content: [
        {
          type: 'prose',
          text: 'Master-detail: selecting a row opens a fixed-width side panel instead of navigating away.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'LayoutPanel in the start or end slot of Layout, holding a fixed width budget',
            'hasDivider to fence it from the content region; isScrollable so long detail scrolls on its own',
            'For user-adjustable width, pair useResizable() with a ResizeHandle on the panel inner edge: after the panel in a start slot, before it in an end slot with isReversed',
            'The handle then owns the divider, so the panel sets hasDivider={false}',
            'Render an EmptyState when nothing is selected, so the region never collapses',
          ],
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Fixed panel, then the resizable form',
          code: `// Recommended panel width: 340–420.
<Layout
  content={<LayoutContent>{/* rows */}</LayoutContent>}
  end={
    <LayoutPanel width={380} hasDivider isScrollable label="Details">
      {/* detail fields, or EmptyState when nothing is selected */}
    </LayoutPanel>
  }
/>

// Resizable: handle first in an end slot, and isReversed so
// dragging left widens the panel.
end={
  <>
    <ResizeHandle isReversed hasDivider resizable={panel.props}
      label="Resize details" />
    <LayoutPanel width={panel.size} hasDivider={false} />
  </>
}`,
        },
        {
          type: 'prose',
          text: 'Verify: at narrow widths the panel yields width instead of squeezing content (see the Responsive guide), and only one element between the regions draws a border.',
        },
      ],
    },
  ],
};
