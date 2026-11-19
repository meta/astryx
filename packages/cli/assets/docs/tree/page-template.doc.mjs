// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/document-the-template/page-template`:
 * the page-only fields that help people find a page.
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
    'Help people find a page: give it a category for `{@command search}` and template listings, and flag a sparse starting shell as a scaffold.',
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
};`,
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
