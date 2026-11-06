// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceTranslationDoc} */

export const docsDense = {
  description: 'core design principles + rules for the design system',
  sections: [
    { section: 'Design Philosophy', title: 'Philosophy', content: [{ type: 'prose', text: 'consistency, adaptability, DX. core ideas:' }, { type: 'list', items: ['components over primitives', 'semantic tokens over hardcoded values', 'theme-agnostic code', 'open internals'] }] },
    { section: 'Rules', title: 'Rules', content: [{ type: 'prose', text: '8 rules for on-system app code.' }, { type: 'list', items: ['use components', 'frame-first layout: shell + region budgets before content ({@link namespace:layout})', 'dense data = rows (Table, List/Item) not Cards; Card = widgets/galleries/settings groups', 'StyleX or Tailwind for styling ({@link namespace:styling})', 'semantic tokens only ({@link namespace:tokens})', 'CSS vars for colors', 'controlled form inputs', 'useLinkComponent() for navigation'] }] },
    { section: 'Styling Approach', title: 'Styling', content: [{ type: 'prose', text: 'xstyle prop for component overrides. StyleX or Tailwind for layout.' }, { type: 'prose', text: 'full guide: {@link namespace:styling}' }] },
    { section: 'Anti-Patterns', title: 'Anti-Patterns', content: [{ type: 'prose', text: 'what breaks theming, routing, or layout, and the fix.' }, { type: 'list', items: ['no inline styles on raw elements', 'no hardcoded colors — use tokens or Tailwind semantic classes', 'no hardcoded spacing', 'no hardcoded <a> — use useLinkComponent()', 'no Card-wrapped list items — frame first, rows for dense data ({@link namespace:layout})', 'no decorative Badge — StatusDot/Token for status', 'read docs before inventing props'] }] },
    { section: 'Design Tokens', title: 'Tokens', content: [{ type: 'prose', text: 'full token reference: {@link namespace:tokens}' }] },
  ],
};
