// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'ScrollableArea',
  displayName: 'Scrollable Area',
  category: 'Layout',
  keywords: ['scroll', 'overflow', 'viewport', 'logical axis', 'keyboard', 'overscroll', 'sticky', 'scrollbar', 'padding', 'full bleed', 'scrollarea', 'scrollview'],
  usage: {
    description: 'Provides a native scroll viewport and a real observed content box. The viewport enters the tab order only while a requested logical axis is effectively scrollable, and containment applies only to effective axes.',
    bestPractices: [
      {guidance: true, description: 'Give every area a concise label that identifies the content keyboard users will scroll.'},
      {guidance: true, description: 'Choose `inline`, `block`, or `both` from content intent; the component maps the logical axes through writing mode and direction.'},
      {guidance: true, description: 'Keep the default `overscroll="allow"` for nested areas unless the interaction deliberately needs containment.'},
      {guidance: true, description: 'Use `useScrollableArea` instead when a component already owns both a viewport and a suitable content box, or when children must remain direct flex/grid items or retain a definite percentage block-size basis.'},
      {guidance: true, description: 'ScrollableArea owns one normal block content box with a 100% minimum size. Inline and both-axis modes use max-content inline sizing, so intrinsic inline layout is intentionally wider than the viewport.'},
      {guidance: true, description: 'Use logical padding props on the content box so nested full-bleed components receive the same inset geometry.'},
      {guidance: true, description: 'Set `isFullBleed` only when the viewport itself should reach an ancestor container edge; it is off by default.'},
      {guidance: true, description: 'Set `stickyContainment="always"` only when a fitting viewport should intentionally remain a Sticky boundary.'},
      {guidance: false, description: 'Hide the native scrollbar without another visible and operable overflow affordance.'},
      {guidance: false, description: 'Add another overflow wrapper around ScrollableArea; one native viewport should own scrolling.'},
    ],
    anatomy: [
      {name: 'Viewport', required: true, description: 'The root native scroll container, accessible name owner, focus target while effective, and `astryx-scrollable-area` theme target.'},
      {name: 'Content box', required: true, description: 'A real inner layout box observed together with the viewport. For inline scrolling it uses max-content inline sizing with a 100% minimum.'},
    ],
  },
  props: [
    {name: 'axis', type: "'inline' | 'block' | 'both'", description: 'Logical axis or axes where native scrolling is allowed.', default: "'block'"},
    {name: 'label', type: 'string', description: 'Accessible name for the viewport when it becomes keyboard scrollable.', required: true},
    {name: 'role', type: "'group' | 'region'", description: 'Semantics for the named viewport.', default: "'group'"},
    {name: 'overscroll', type: "'allow' | 'contain'", description: 'Whether effective axes continue scrolling an ancestor at their edge.', default: "'allow'"},
    {name: 'width', type: 'SizeValue', description: 'Width of the viewport; a number is interpreted as pixels, a string is used as-is.'},
    {name: 'height', type: 'SizeValue', description: 'Height of the viewport; a number is interpreted as pixels, a string is used as-is.'},
    {name: 'maxWidth', type: 'SizeValue', description: 'Maximum width of the viewport.'},
    {name: 'minHeight', type: 'SizeValue', description: 'Minimum height of the viewport.'},
    {name: 'stickyContainment', type: "'whenScrollable' | 'always'", description: 'Whether fitting content passes Sticky ownership to an outer container or deliberately keeps this viewport as the CSS Sticky boundary.', default: "'whenScrollable'"},
    {name: 'padding', type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10', description: 'Content padding on every logical edge; publishes matching inset geometry.', default: '0'},
    {name: 'paddingInline', type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10', description: 'Logical inline-axis content padding; overrides `padding` on that axis.'},
    {name: 'paddingInlineStart', type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10', description: 'Logical inline-start content padding; overrides broader padding values.'},
    {name: 'paddingInlineEnd', type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10', description: 'Logical inline-end content padding; overrides broader padding values.'},
    {name: 'paddingBlock', type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10', description: 'Logical block-axis content padding; overrides `padding` on that axis.'},
    {name: 'paddingBlockStart', type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10', description: 'Logical block-start content padding; overrides broader padding values.'},
    {name: 'paddingBlockEnd', type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10', description: 'Logical block-end content padding; overrides broader padding values.'},
    {name: 'isFullBleed', type: 'boolean', description: 'Lets the viewport escape inherited container padding without changing content padding.', default: 'false'},
    {name: 'children', type: 'ReactNode', description: 'Content rendered inside the observed content box.'},
    {name: 'xstyle', type: 'StyleXStyles', description: 'StyleX sizing and native scrollbar presentation overrides for the viewport.'},
  ],
  playground: {
    defaults: {
      axis: 'block',
      label: 'Scrollable example',
      children: 'Add enough content to exceed a constrained viewport.',
    },
  },
  theming: {
    targets: [
      {className: 'astryx-scrollable-area', visualProps: ['axis']},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'native logical-axis scroll viewport with conditional keyboard access, live edge state, and observed content geometry',
  usage: {
    description: 'Use for a complete viewport/content composition; use useScrollableArea for existing structure.',
    bestPractices: [
      {guidance: true, description: 'Always provide a concise label.'},
      {guidance: true, description: 'Prefer overscroll allow; contain only deliberate nested interactions.'},
      {guidance: true, description: 'Use content padding props to publish inset; use isFullBleed only for viewport escape.'},
      {guidance: false, description: 'Nest another overflow wrapper around it.'},
    ],
    anatomy: [
      {name: 'Viewport', required: true, description: 'native scrolling, conditional tab stop, and theme target'},
      {name: 'Content box', required: true, description: 'real observed layout box'},
    ],
  },
  propDescriptions: {
    axis: "logical scroll intent: 'inline' | 'block' (default) | 'both'",
    label: 'required accessible viewport name',
    role: "named viewport semantics: 'group' (default) | 'region'",
    overscroll: "edge behavior: 'allow' (default) | 'contain' on effective axes only",
    width: 'viewport width',
    height: 'viewport height',
    maxWidth: 'viewport maximum width',
    minHeight: 'viewport minimum height',
    stickyContainment: "fitting Sticky ownership: 'whenScrollable' (default) | 'always'",
    padding: 'content inset on every edge; defaults to 0 and publishes geometry',
    paddingInline: 'logical inline-axis content inset',
    paddingInlineStart: 'logical inline-start content inset',
    paddingInlineEnd: 'logical inline-end content inset',
    paddingBlock: 'logical block-axis content inset',
    paddingBlockStart: 'logical block-start content inset',
    paddingBlockEnd: 'logical block-end content inset',
    isFullBleed: 'opt-in viewport escape from inherited container padding',
    children: 'content inside the observed box',
    xstyle: 'viewport sizing and native scrollbar presentation overrides',
  },
};
