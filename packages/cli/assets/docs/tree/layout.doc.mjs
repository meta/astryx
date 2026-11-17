// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs layout`: the layout namespace. A root of the docs tree
 * that groups the outside-in layout guides: scaffold, structure,
 * headers-and-panels, spacing, and responsive.
 *
 * The flat layout topic this replaces was a 22 KB monolith. Each child guide
 * now answers one question and is findable by search on its own.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'layout',
  title: 'Layout',
  summary:
    'Build an app layout outside-in: scaffold the regions, structure the content, tune the spacing, then adapt across widths.',
  keywords: [
    'layout',
    'scaffold',
    'structure',
    'spacing',
    'responsive',
    'AppShell',
    'SideNav',
    'TopNav',
    'hasDivider',
    'MobileNav',
    'contentWidth',
  ],
  blocks: [
    {
      type: 'prose',
      text: 'Build a layout outside-in. Settle the shell and its region budgets before any content exists, then work inward. Content-first layouts drift into a padded column of cards, because every section ends up inventing its own container.',
    },
    {
      type: 'list',
      style: 'ordered',
      items: [
        'Scaffold: pick the frame before any content, and give every fixed region a width budget. Use AppShell when the app has navigation: SideNav by default, TopNav for a shallow nav. Data views take the whole width of their region; text and forms sit in a column capped by contentWidth',
        'Structure: give each region one lead and one primary action. Records render as rows, not one box per record. Rank text with weight and the secondary color, not with smaller sizes',
        'Spacing: the container owns the padding, and children zero their margins. Keep one content line per region. Small gaps bind related items; large gaps separate groups. Use tokens inside regions',
        'Breakpoints: decide what each region does as the width changes. Navigation becomes MobileNav, a side panel moves into an overlay, and columns reflow by a minimum width, never by a fixed count',
      ],
    },
    {
      type: 'prose',
      text: 'Each guide below has the components, examples, and checks for one step. This guide decides layout, not component APIs. Run `{@command build "<idea>"}` to start from the closest template for your app type, and `{@command component <Name>}` for a component\'s props.',
    },
  ],
  slots: {
    guides: {title: 'Guides', accepts: {kinds: ['generic']}},
  },
};
