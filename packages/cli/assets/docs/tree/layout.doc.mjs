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
        'Scaffold: pick the frame and give every fixed region a width budget. AppShell for apps with navigation (SideNav by default; TopNav for a shallow nav over a control-heavy page), Layout with a LayoutPanel in its start or end slot for multi-pane tools, and a plain content column for documents and forms. Data views take the full width of their region; text, forms and lists sit in a column capped by Layout contentWidth (640 for text and forms, 960 for mixed content)',
        'Structure: one lead and one primary action per region. Section is the default unit, with no border; records render as rows (Table for columns, List for single lines), never one Card each; Card is for a self-contained widget or a hard boundary. Body copy is plain Text with no props: rank with weight and the secondary color, not smaller text',
        "Spacing: the container owns padding, and children zero their margins. Hold one content line per region and use tokens inside regions (raw px only for structural widths). Tight gaps (gap={1} to {2}) bind; generous gaps (gap={4} to {6}) separate. Pin a header or footer with LayoutHeader and LayoutFooter in Layout's slots",
        "Breakpoints: write down what each region does as width changes. Navigation becomes MobileNav at AppShell's mobileNav breakpoint, a side panel becomes a Dialog or BottomSheet (useMediaQuery), and columns that must reflow use Grid columns={{minWidth, max}}: a number of columns never reflows",
      ],
    },
    {
      type: 'code',
      lang: 'tsx',
      label: 'A three-region tool frame',
      code: `<AppShell sideNav={<SideNav>{/* nav items */}</SideNav>}>
  <Layout
    content={<LayoutContent>{/* table fills its region */}</LayoutContent>}
    end={<LayoutPanel width={380} hasDivider isScrollable>{/* detail */}</LayoutPanel>}
  />
</AppShell>`,
    },
    {
      type: 'prose',
      text: 'Each guide below has the rules, examples and checks for one step. This guide decides layout, not component APIs. Run `{@command build "<idea>"}` to start from the closest template for your app type, and `{@command component <Name>}` for a component\'s props.',
    },
  ],
  slots: {
    guides: {title: 'Guides', accepts: {kinds: ['generic']}},
  },
};
