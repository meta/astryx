// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The component categories a component doc's `category` names, with
 * what each one is for. A category that holds the records a family of page
 * templates shows names that family as its `pageFamily`: `build` reads it to
 * tell a component that holds a page's records ("a list of jobs") from one
 * control ("a dropdown of jobs").
 * @input none
 * @output {@link COMPONENT_CATEGORIES}
 * @position authoring/doctypes/component, beside the component doc type.
 */

/**
 * @typedef {object} ComponentCategory
 * @property {string} description What the category holds.
 * @property {string} [pageFamily] The family of page templates whose records
 *   the category's components hold, as a template's category names it before
 *   " - " (`Table` for `Table - Basic`).
 */

/**
 * Every component category, by the name a doc's `category` uses.
 * @type {Readonly<Record<string, ComponentCategory>>}
 */
export const COMPONENT_CATEGORIES = Object.freeze({
  Action: {
    description: 'Interactive triggers: buttons, links, toggles, menus.',
  },
  Chat: {
    description: 'Conversational UI: messages, composers, layouts.',
    pageFamily: 'AI Chat',
  },
  Container: {description: 'Wrappers: cards, carousels, collapsibles.'},
  Content: {description: 'Display: text, icons, avatars, code blocks.'},
  'Form Controls': {
    description: 'Data entry: text fields, selectors, date pickers.',
  },
  'Data Input': {
    description: "Deprecated compatibility alias for 'Form Controls'.",
  },
  'Data Visualization': {description: 'Charts, graphs, 3D visualizations.'},
  'Feedback & Status': {
    description: 'Progress indication: spinners, banners, badges.',
  },
  Layout: {description: 'Structural: grid, stack, dividers, app shell.'},
  Navigation: {description: 'Wayfinding: tabs, breadcrumbs, sidebars.'},
  Overlay: {description: 'Layered UI: dialogs, popovers, tooltips.'},
  'Table & List': {
    description: 'Tabular and list data display.',
    pageFamily: 'Table',
  },
  Utility: {description: 'Providers and context: themes, link providers.'},
});
