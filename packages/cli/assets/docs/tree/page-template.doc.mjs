// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/document-the-template/page-template`:
 * the page-only fields that help people find a page and name where blocks go.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'page-template',
  placement: {
    parent: 'namespace:document-the-template',
    slot: 'guides',
    order: 20,
  },
  title: 'Page template',
  category: 'guide',
  description:
    'Help people find a page and fill it: give it a category for `{@command search}` and template listings, name the slots where blocks go, and flag a sparse starting shell as a scaffold.',
  sections: [
    {
      id: 'start-from-the-generated-page-doc',
      title: 'Start from the generated page doc',
      content: [
        {
          type: 'prose',
          text: '`integration add template` writes a page doc by default. Replace its sample description, then add the page-only fields below.',
        },
        {
          type: 'code',
          lang: 'javascript',
          label: 'templates/acme-dashboard.doc.mjs',
          code: `/** @type {import('@astryxdesign/cli/authoring').IntegrationTemplateDoc} */
export default {
  type: 'page',
  name: 'acme-dashboard',
  displayName: 'Acme Analytics Dashboard',
  description:
    'A filterable account-health dashboard with headline metrics, trends, and a recent-activity table. Dashboard, reporting, analytics, or status overview.',
  category: 'Dashboard - Analytics',
  isReady: false,
  slots: [
    {name: 'header', kind: 'header', description: 'The title row.'},
    {name: 'body', kind: 'main', description: 'Everything under the title row.'},
  ],
};`,
        },
      ],
    },
    {
      id: 'name-the-places-blocks-go',
      title: 'Name the places blocks go',
      content: [
        {
          type: 'prose',
          text: 'Declare `slots` so `{@command build}` can put the blocks it suggests into the right part of your page. Block templates name the kinds of place they fit with the same vocabulary; the fields and the CLI release that reads them are in {@link schema:template-doc}, and the kinds in the TemplateSlotKind type.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'List each region of the layout a builder fills or replaces, and each part of the body.',
            'Give each slot the one kind that says what goes there. Name a part of the body by what it holds, and keep main for a body that takes any part.',
            'Name each slot with one or two lowercase words joined by a hyphen, unique in the page, and describe in one sentence where it is.',
            'A layer the page opens from a trigger is not a slot: blocks for it fit overlay, which no page holds.',
          ],
        },
      ],
    },
    {
      id: 'help-people-find-the-page',
      title: 'Help people find the page',
      content: [
        {
          type: 'prose',
          text: 'Every field is in {@link schema:template-doc}.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Set `category` to the most specific supported `{Group} - {Variant}` value. Its words become search terms for `{@command search}`, and it appears in the JSON template list.',
            'Set `scaffold: true` only for a deliberately sparse starting shell. The JSON template list reports it, so tools and galleries can tell a scaffold from a finished page.',
            "Fields that only Astryx's own gallery reads, such as `isHiddenFromOverview`, have no effect on integration templates.",
          ],
        },
      ],
    },
  ],
};
