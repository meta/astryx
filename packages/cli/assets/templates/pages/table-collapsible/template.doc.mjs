// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Collapsible Table',
  displayName: 'Collapsible Table',
  description:
    'Several tables on one page, each in a collapsible card with its own columns — for groups that do not share a schema, where one table would stand full of empty cells. One time range drives them all, and rows expand into a history chart. Accounts, integrations, sections, sort, expand, or collapse.',
  isReady: true,
  category: 'Table - Grouped',
  icons: {
    ArrowsRightLeftIcon: 'transfer',
    BuildingLibraryIcon: 'bank',
    CreditCardIcon: 'creditCard',
    PresentationChartLineIcon: 'activity',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top LayoutHeader with page title, net position summary, Expand all button and time range segmented control.',
    },
    {
      name: 'groups',
      kind: 'table',
      description:
        'LayoutContent stack of collapsible account cards, each with its own sortable table whose rows expand into charts.',
    },
  ],
};
