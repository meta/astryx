// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'TabBarMoreList',
  displayName: 'Tab Bar More List',
  category: 'Navigation',
  keywords: ['more tab', 'more list', 'overflow tabs', 'tab bar', 'more'],
  description:
    "The More tab's screen, as on iOS: one row per tab past the fourth, with its icon, its label and a disclosure chevron. Give it the same TabBarItem children as TabBar, and render it while TabBar's value is its moreValue. A disabled tab's row is disabled too. Rearranging the tabs (iOS's Edit) is not available yet. Experimental: lands in lab first.",
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'The same TabBarItem elements given to TabBar.',
      required: true,
    },
    {
      name: 'onChange',
      type: '(value: string) => void',
      description:
        "Called with a row's value when it is chosen: show that section inside More, which stays selected in the bar.",
      required: true,
    },
    {
      name: 'value',
      type: 'string',
      description: "The selected tab's value: its row reads as selected.",
    },
  ],
  usage: {
    description:
      "Render TabBarMoreList as the More tab's screen while TabBar's value is its moreValue, with the same TabBarItem children. Show a section chosen there inside More's own navigation stack.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Give it the same tabs, in the same order, as the TabBar it belongs to.',
      },
      {
        guidance: false,
        description:
          "Don't use it as a general menu or list; use List for those.",
      },
    ],
  },
};
