// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs layout/headers-and-footers`: pin a header or footer
 * while the body scrolls.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'headers-and-footers',
  title: 'Headers and footers',
  placement: {parent: 'namespace:layout', slot: 'guides', order: 30},
  category: 'guide',
  description:
    'Pin a header or footer while the body scrolls, so the title and commit actions stay reachable.',
  keywords: [
    'LayoutHeader',
    'LayoutFooter',
    'Toolbar',
    'defaultHasDividers',
    'pinned header',
    'pinned footer',
    'scrolling body',
  ],

  sections: [
    {
      id: 'headers-and-footers',
      title: 'Headers and footers',
      content: [
        {
          type: 'prose',
          text: 'A region can pin a header or footer while its body scrolls. Both are Layout slots, and padding set once on Layout reaches all three, so header, body, and footer share one content line.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'LayoutHeader in the header slot: the region title and its primary action',
            'Toolbar instead of LayoutHeader when the header carries interactive controls',
            'LayoutFooter in the footer slot: actions that commit the work and must stay reachable',
            'defaultHasDividers on Layout fences both at once, rather than hasDivider per slot',
          ],
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Pinned header and footer around a scrolling body',
          code: `// padding on Layout reaches every slot, so all three align.
<Layout
  padding={4}
  defaultHasDividers
  header={<LayoutHeader>{/* title + primary action */}</LayoutHeader>}
  content={<LayoutContent>{/* rows */}</LayoutContent>}
  footer={<LayoutFooter>{/* Save and Cancel */}</LayoutFooter>}
/>`,
        },
        {
          type: 'prose',
          text: 'Verify: scroll the body. The header and footer stay put, their dividers run full-bleed, and all three still share one left content line.',
        },
      ],
    },
  ],
};
