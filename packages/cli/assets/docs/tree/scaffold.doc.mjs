// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs layout/scaffold`: pick the shell, budget each region,
 * and choose navigation — before any content exists.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'scaffold',
  title: 'Scaffold',
  placement: {parent: 'namespace:layout', slot: 'guides', order: 10},
  category: 'guide',
  description:
    'Pick the shell, budget each region, and choose navigation, before any content exists.',
  keywords: [
    'shell',
    'navigation',
    'frame',
    'region',
    'width budget',
  ],

  sections: [
    {
      id: 'scaffold',
      title: 'Scaffold',
      content: [
        {
          type: 'prose',
          text: 'Pick the shell, budget each region, and choose navigation, before any content exists. Shell and Navigation cover each step; these rules hold for both.',
        },
        {
          type: 'list',
          style: 'do',
          items: [
            'Decide the frame, region width budgets, and fill or capped before any content exists',
            'State the reason for the navigation choice, or inherit the template pairing',
            'Reserve raw px for structural widths; interior spacing uses tokens',
          ],
        },
        {
          type: 'list',
          style: 'dont',
          items: [
            'Build content-first and wrap each section in a Card, producing a padded scroll column',
            'Stretch prose, forms, or lists across a wide region instead of capping with contentWidth',
            'SideNav when the nav is really filters or controls, or must hold wide elements like breadcrumbs',
            'TopNav when top-slot ownership is unclear, or the hierarchy is deep or still growing',
            'Both bars when the ecosystem layer is thin, so the second only wastes space',
            'Deviate from the template navigation pairing without a stated reason',
          ],
        },
      ],
    },
    {
      id: 'shell',
      title: 'Shell',
      content: [
        {
          type: 'prose',
          text: 'Pick the shell and budget its regions before any content exists. Structural widths are the one place raw px belongs; everything inside them uses the spacing scale.',
        },
        {
          type: 'list',
          style: 'ordered',
          items: [
            'Pick the frame: AppShell for nav apps, Layout with LayoutPanel in a start or end slot for multi-pane tools, or a plain content column for documents and forms',
            'Give every fixed region a width budget, so no region has to negotiate for space at render time',
            'Read the content to set fill or capped: tables, charts, and boards fill their region; prose, forms, and lists cap with Layout contentWidth so lines never over-stretch',
            'Set each region container policy, rows or card grid, before writing content',
          ],
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'A three-region tool frame',
          code: `// Recommended budgets: SideNav 240–280, icon rail 64–72,
// side panel 340–420, filter rail 220–260.
<AppShell sideNav={<SideNav>{/* nav items */}</SideNav>}>
  <Layout
    content={<LayoutContent>{/* table fills its region */}</LayoutContent>}
    end={<LayoutPanel width={380} hasDivider>{/* detail */}</LayoutPanel>}
  />
</AppShell>

// Capped instead: 640 suits text and forms, 960 mixed content.
// Dividers stay full-bleed.
<Layout
  contentWidth={640}
  content={<LayoutContent>{/* settings form */}</LayoutContent>}
/>`,
        },
        {
          type: 'prose',
          text: 'Verify: every region has a width budget, a fill-or-capped decision, and a container policy written down before any content exists.',
        },
      ],
    },
    {
      id: 'navigation',
      title: 'Navigation',
      content: [
        {
          type: 'prose',
          text: 'When the frame leaves navigation open, default to SideNav: it absorbs destinations you have not planned yet. App type and destination count are guiding indicators, not determining rules.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'SideNav, the default: grouping needed, customizable nav, items with secondary actions, or nav that collapses. Trackers, consoles, and settings usually start here',
            'TopNav: a shallow nav you expect to stay shallow, context that must stay visible, or a control- and filter-heavy page; add a TabList for a second level. Media libraries often sit here, over grid content',
            'Both: a genuine suite, where TopNav carries ecosystem-wide concerns (context switcher, global search) and SideNav carries product nav',
            'Neither: messaging and feeds use a column frame of rail, nav, stream, and panel',
          ],
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Navigation passed to AppShell',
          code: `// Default: product nav on the side.
<AppShell sideNav={<SideNav>{/* items */}</SideNav>} />

// Shallow, stable nav on a control-heavy page.
<AppShell topNav={<TopNav>{/* items */}</TopNav>} />

// Suite: ecosystem concerns on top, product nav on the side.
<AppShell topNav={<TopNav />} sideNav={<SideNav />} />`,
        },
        {
          type: 'prose',
          text: 'Verify: you can state the reason in one sentence, and the choice still holds if the nav doubles in size. `{@command build "<idea>"}` names the template to start from; scaffold it and the pairing is already wired up.',
        },
      ],
    },
  ],
};
