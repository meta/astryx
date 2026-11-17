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
        'Scaffold: pick the shell, budget each region, and choose navigation',
        "Structure: rank each region's content and choose its container",
        'Spacing: align each region to one content line, then set gaps and density',
        'Breakpoints: decide what each region does as width changes',
      ],
    },
    {
      type: 'prose',
      text: 'This guide decides layout, not component APIs. Run `{@command build "<idea>"}` to start from the closest template for your app type, and `{@command component <Name>}` for a component\'s props.',
    },
  ],
  slots: {
    guides: {title: 'Guides', accepts: {kinds: ['generic']}},
  },
};
