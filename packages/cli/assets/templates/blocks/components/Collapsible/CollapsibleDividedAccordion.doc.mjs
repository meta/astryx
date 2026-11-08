// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Collapsible',
  name: 'Collapsible — FAQ',
  displayName: 'Collapsible — FAQ',
  registry: {aliases: ['collapsible/divided-accordion']},
  description:
    "FAQ built with hasDividers: row hairlines and density padding with no custom CSS. Questions set their own type — body at semibold, not the trigger's default 17px large — so a list of questions reads as rows rather than a stack of headings, and question and answer separate on weight and color instead of size.",
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Collapsible', 'CollapsibleGroup', 'Text', 'Link', 'Stack'],
};
