// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs authoring/building-blocks/templates/document-the-template/block-template`:
 * the block-only fields: where the block goes, component relationships and the
 * preview shape.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'block-template',
  placement: {
    parent: 'namespace:document-the-template',
    slot: 'guides',
    order: 30,
  },
  title: 'Block template',
  category: 'guide',
  description:
    'Describe a smaller composition, say where it goes in a page, choose its preview shape, and connect it to component examples only when that relationship is real.',
  sections: [
    {
      id: 'start-with-a-standalone-block',
      title: 'Start with a standalone block',
      content: [
        {
          type: 'prose',
          text: 'Most blocks stand alone. Start with this shape unless the block is specifically the example or showcase for one component.',
        },
        {
          type: 'code',
          lang: 'javascript',
          label: 'templates/acme-stat-card.doc.mjs',
          code: `/** @type {import('@astryxdesign/cli/authoring').IntegrationTemplateDoc} */
export default {
  type: 'block',
  name: 'acme-stat-card',
  displayName: 'Acme Stat Card',
  description:
    'A compact metric card with a current value, period delta, and supporting trend. KPI, scorecard, summary, or dashboard statistic.',
  isReady: false,
  aspectRatio: 4 / 3,
  componentsUsed: ['Card', 'HStack', 'Text', 'VStack'],
  fits: ['metrics'],
};`,
        },
        {
          type: 'prose',
          text: 'Do not add `exampleFor` only because the block uses a component. `componentsUsed` records composition; `exampleFor` declares that one component owns the example.',
        },
      ],
    },
    {
      id: 'choose-the-component-relationship',
      title: 'Choose the component relationship',
      content: [
        {
          type: 'prose',
          text: 'Every field is in {@link schema:template-doc}.',
        },
        {
          type: 'prose',
          text: 'Keep one clear primary owner. Use the `also*` fields only for intentional secondary placements.',
        },
        {
          type: 'code',
          lang: 'javascript',
          label: 'templates/acme-status-card-showcase.doc.mjs',
          code: `/** @type {import('@astryxdesign/cli/authoring').IntegrationTemplateDoc} */
export default {
  type: 'block',
  name: 'acme-status-card-showcase',
  displayName: 'Acme Status Card Showcase',
  description:
    'An account-health summary that demonstrates status, trend, and action states for AcmeStatusCard.',
  isReady: true,
  exampleFor: 'AcmeStatusCard',
  isShowcase: true,
  alsoExampleFor: ['AcmeDashboard'],
  aspectRatio: 4 / 3,
  componentsUsed: ['AcmeStatusCard', 'Button', 'HStack', 'VStack'],
};`,
        },
        {
          type: 'prose',
          text: 'Then check the package-scoped template list ({@link generic:template-doc-overview}) and confirm the entry carries the relationship you set. `{@command component}` does not show integration blocks, so the list is where to check.',
        },
      ],
    },
    {
      id: 'say-where-the-block-goes',
      title: 'Say where the block goes',
      content: [
        {
          type: 'prose',
          text: 'Declare `fits` so `{@command build}` can put the block into the right slot of the page it starts from. Page templates name their slots with the same kinds. {@link schema:template-doc} gives the release that first reads `fits`; the TemplateSlotKind type says what each kind holds.',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            'Decide from what the block renders and what a builder uses it for, not from the component name alone.',
            'Give a whole part of a page body its section kind, and a region of the page its region kind. Use main only for a block that fills a whole page body.',
            'A block that opens above the page from a trigger fits overlay, even when the block also shows the trigger. A small piece that goes inside another piece fits inline; a single control goes with the section it serves.',
            "Use an empty list (`fits: []`) for a reference that lays out a component's options side by side, and for a block that frames a whole app or page, which a page template starts instead.",
          ],
        },
      ],
    },
    {
      id: 'choose-a-useful-preview',
      title: 'Choose a useful preview',
      content: [
        {
          type: 'prose',
          text: 'Every field is in {@link schema:template-doc}.',
        },
        {
          type: 'prose',
          text: 'Set `aspectRatio` from the value for the closest shape below, render the block at that ratio, and adjust it until it neither clips nor leaves large empty space. These are starting points, not contract defaults.',
        },
        {
          type: 'table',
          headers: ['Block shape', 'Starting value'],
          rows: [
            ['Wide navigation, banner, toolbar, or tabs', '`16 / 4`'],
            ['Square button, badge, avatar, icon, spinner, or status', '`1`'],
            ['Tall navigation, calendar, list, or tree', '`3 / 4`'],
            ['Content card, dialog, table, or form group', '`4 / 3`'],
          ],
        },
        {
          type: 'prose',
          text: "`scale` affects only Astryx's own block previews. Integration blocks can leave it out.",
        },
      ],
    },
  ],
};
