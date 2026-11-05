// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  name: 'elevation',
  title: 'Elevation',
  category: 'foundations',
  description:
    'Shadow tokens for visual elevation and inset state rings.',
  tokenCategory: 'shadow',

  sections: [
    {
      title: 'Overview',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'Elevation tokens create depth through box-shadow. Three levels (low, med, high) establish a visual hierarchy for floating elements. Inset shadows provide focus and selection rings for interactive components.',
        },
      ],
    },
    {
      title: 'Elevation Scale',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'Each level adds stronger offset and spread. Shadow color adapts to dark mode automatically via light-dark().',
        },
        {
          type: 'token-ref',
          topic: 'tokens',
          section: 'Shadow Tokens',
        },
      ],
    },
    {
      title: 'Choosing a level',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'Pick the level by how far the surface sits from the page, not by how much shadow you want. Elevation encodes stacking order: a higher level means the surface is layered over more of the UI. Use exactly one level per surface, and only raise a surface above `none` when it actually sits above other content.',
        },
        {
          type: 'table',
          headers: ['Level', 'When to use', 'Examples'],
          rows: [
            [
              'none',
              'The component is flat and embedded in the surface; it is part of the page, not layered above it. This is the default for every surface except ChatComposer.',
              'A Card in a grid, an inline Banner, a standard Button',
            ],
            [
              'low',
              'The component is in the normal page flow but should read as distinct from the background. Use for emphasis or to separate the component from the surface behind it; the component still sits on the page, it is not floating over other content.',
              'A raised Card that needs emphasis, a ChatComposer',
            ],
            [
              'med',
              'The component sits over other content on the same page; it floats above nearby elements but not the whole screen.',
              'A Popover, a floating Banner, a floating action Button',
            ],
            [
              'high',
              'The component is placed over the entire UI; it is the topmost layer and typically has a backdrop or takes focus from everything else.',
              'A modal Dialog, a full-screen overlay surface',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'If two surfaces overlap, the one on top takes the higher level. If a surface does not overlap anything, it is `none` or `low`; never `med` or `high`.',
        },
      ],
    },
    {
      title: 'The elevation prop',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'Configurable surfaces expose a single `elevation` prop instead of asking consumers to hand-write a box-shadow. It takes the graded enum `none | low | med | high`, narrowed per component to the steps that surface needs: Card, ClickableCard, SelectableCard, Button, IconButton, ButtonGroup, ToggleButton, and Banner expose the full scale, while ChatComposer exposes only `none | low`. `none` is a flat literal (`box-shadow: none`); the other levels map to the `--shadow-*` tokens above, so a surface stays theme-agnostic.',
        },
        {
          type: 'prose',
          text: 'Prop defaults preserve current appearance: every surface defaults to `none` except ChatComposer, which defaults to `low` to keep its raised look. Set `elevation="none"` to flatten it; the flat composer draws a border with the same rest / hover / focus treatment as a text input.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Raising a surface with the elevation prop',
          code: `import {Plus} from 'lucide-react';

// Flat by default; raise only when the surface needs to float.
<Card elevation="low">Raised card</Card>

// A floating action button.
<IconButton icon={<Icon icon={Plus} />} label="New" variant="primary" elevation="med" />

// Flatten the composer (defaults to 'low').
<ChatComposer elevation="none" onSubmit={handleSubmit} />`,
        },
        {
          type: 'prose',
          text: 'Always float; no prop: intrinsic overlays (Dialog, Popover, Tooltip, Toast, HoverCard, DropdownMenu, and the components that compose them) bake their elevation in and never expose the prop. Flow content (inputs, Text, layout) is never elevated; input fields use inset rings, which are a separate concept from elevation.',
        },
      ],
    },
    {
      title: 'Usage',
  category: 'foundations',
      content: [
        {
          type: 'prose',
          text: 'When building a custom surface, read elevation from the token scale rather than a hand-rolled shadow; the same tokens the elevation prop resolves to.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Applying elevation',
          code: `import {shadowVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  dropdown: {
    boxShadow: shadowVars['--shadow-med'],
  },
  dialog: {
    boxShadow: shadowVars['--shadow-high'],
  },
  inputFocused: {
    boxShadow: shadowVars['--shadow-inset-selected'],
  },
});`,
        },
      ],
    },
    {
      title: 'Best Practices',
  category: 'foundations',
      content: [
        {
          type: 'list',
          style: 'do',
          items: [
            'Reach for the `elevation` prop on a configurable surface before writing any custom shadow.',
            'Choose the level by how far the surface sits from the page: `none` when flat/embedded, `low` when in-flow but distinct, `med` when over page content, `high` when over the whole UI. See "Choosing a level".',
            'Use inset shadows for input focus/selection states; they compose better than outlines.',
          ],
        },
        {
          type: 'list',
          style: 'dont',
          items: [
            'Hand-write a `box-shadow` in app code; set the `elevation` prop or read `shadowVars` instead.',
            'Raise a surface that does not sit above other content; a non-overlapping surface is `none` or `low`, never `med` or `high`.',
            'Stack multiple elevation levels on the same element.',
            'Use elevation shadows for decorative borders. Use --color-border tokens instead.',
          ],
        },
      ],
    },
  ],
};
