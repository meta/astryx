// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useContainerReveal',
  displayName: 'useContainerReveal',
  keywords: ['reveal', 'hover', 'focus', 'container', 'row', 'actions', 'overlay', 'conceal', 'hidden', 'show'],
  params: [
    {
      name: 'options',
      type: 'UseContainerRevealOptions',
      description: 'Configuration object for the reveal container. Optional.',
      required: false,
    },
    {
      name: 'options.isEnabled',
      type: 'boolean',
      description: 'When false the hook is inert: the container gets no styles and content getters return no styles, so content is always shown. Read on every render, so a component can flip it after mount (e.g. revealOn === "hover").',
      default: 'true',
      required: false,
    },
  ],
  returns: [
    {
      name: 'getContainerProps',
      type: '(options?: ContainerRevealOptions) => {className?: string; style?: CSSProperties}',
      description: 'Spread onto the container whose hover/focus-within drives the reveal. Accepts hoverDelay (ms the pointer must dwell before the reveal starts: a hover-intent gate like Tooltip\'s and HoverCard\'s delay, so a cursor sweeping across a list leaves nothing painted behind it) and forceState ("active" | "inactive") to pin the trigger state when a caller owns it: a motion gate, a scroll, or a row whose menu is open. "inactive" still yields to keyboard focus and coarse pointers.',
    },
    {
      name: 'getContentRevealProps',
      type: '(options?: ContentRevealOptions) => {className?: string; style?: CSSProperties}',
      description: 'Spread onto each revealed / concealed child. Accepts isRevealInverted to conceal-on-hover instead of reveal-on-hover, isLayoutPreserved to reserve the layout box while hidden (opacity-only) and avoid layout shift, and forceVisibility ("shown" | "hidden") to pin this one element\'s appearance whatever the container is doing. "hidden" yields to focus.',
    },
  ],
  usage: {
    description:
      'A headless hover/focus reveal primitive. Gives a container a scoped trigger that reveals (or conceals) content inside it when the container is hovered or receives keyboard focus: the classic "row actions appear on hover" pattern. The reveal is CSS-only: no hover state lives in React and hovering never triggers a re-render. The caller authors no StyleX for the reveal itself; the hook hands out the container and content styles, and a nested container shadows its ancestor, so nested containers never leak hover/focus into one another. Accessible by construction: revealed content is visually hidden at rest with position and opacity (never display:none), so it stays mounted, keeps its place in the tab order, and is announced to assistive technology; it reveals on :focus-within so keyboard users see it when tabbing in, stays visible under a coarse primary pointer (never gated behind hover there), and honors prefers-reduced-motion.',
    bestPractices: [
      { guidance: true, description: 'Destructure getContainerProps and getContentRevealProps; spread getContainerProps() on the container (via mergeProps with your own stylex.props) and getContentRevealProps() on the content to reveal.' },
      { guidance: true, description: 'Use for secondary affordances: reveal-on-hover row actions (edit/copy/remove on list or table rows) and overlay controls on a card or media tile (e.g. Thumbnail\'s remove button).' },
      { guidance: true, description: 'Gate the reveal with isEnabled when a consumer prop decides whether content is revealed on hover or always shown; it can change at any time.' },
      { guidance: true, description: 'Pass isLayoutPreserved for absolutely-positioned or overlay content to reserve its box and avoid layout shift when it appears.' },
      { guidance: true, description: 'Set a hoverDelay (100-250ms) on rows in a long list, so a cursor travelling across the list does not light up every row it passes; keyboard and touch still reveal immediately.' },
      { guidance: true, description: 'Reach for forceState when something other than the pointer owns the interaction (a drag, a scroll or motion gate, an open row menu), and forceVisibility when just one element should ignore the container.' },
      { guidance: false, description: 'Reach past the API into the hook\'s private custom properties (--_reveal-opacity and friends) to suppress a reveal; use forceState / forceVisibility, which survive a rename.' },
      { guidance: false, description: 'Use it to hide content that must always be discoverable; keep essential actions visible instead of gating them behind hover.' },
    ],
  },
  relatedComponents: ['Thumbnail'],
  relatedHooks: ['useClickableContainer'],
  importPath: '@astryxdesign/core/hooks',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Headless hover/focus reveal primitive. Gives a container a scoped trigger that reveals (or conceals) content inside it on hover / keyboard focus: the "row actions appear on hover" pattern. CSS-only: no hover state in React, no re-render on hover. Caller authors no StyleX; hook hands out container + content styles; a nested container shadows its ancestor, so nested containers never leak hover/focus. Accessible: revealed content visually hidden at rest via position + opacity (never display:none), stays mounted + in tab order + announced; reveals on :focus-within, stays visible under a coarse primary pointer, honors prefers-reduced-motion.',
  paramDescriptions: {
    options: 'config for reveal container. optional.',
    'options.isEnabled': 'when false hook is inert: no container styles, content getters return no styles, content always shown. Read every render, so it can flip after mount.',
  },
  returnDescriptions: {
    getContainerProps: 'spread onto container whose hover/focus-within drives reveal. Accepts hoverDelay (ms dwell before reveal starts: hover-intent gate like Tooltip / HoverCard delay) + forceState ("active" | "inactive") to pin trigger state when a caller owns it. "inactive" yields to keyboard focus + coarse pointers.',
    getContentRevealProps: 'spread onto each revealed / concealed child. Accepts isRevealInverted (conceal-on-hover), isLayoutPreserved (reserve layout box while hidden) + forceVisibility ("shown" | "hidden") to pin this element regardless of container. "hidden" yields to focus.',
  },
  usage: {
    description:
      'Headless hover/focus reveal primitive. Gives a container a scoped trigger that reveals (or conceals) content inside it on hover / keyboard focus: the "row actions appear on hover" pattern. CSS-only: no hover state in React, no re-render on hover. Caller authors no StyleX; hook hands out container + content styles; a nested container shadows its ancestor, so nested containers never leak hover/focus. Accessible: revealed content visually hidden at rest via position + opacity (never display:none), stays mounted + in tab order + announced; reveals on :focus-within, stays visible under a coarse primary pointer, honors prefers-reduced-motion.',
    bestPractices: [
      { guidance: true, description: 'Destructure getContainerProps + getContentRevealProps; spread getContainerProps() on container (via mergeProps w/ your stylex.props) + getContentRevealProps() on content to reveal.' },
      { guidance: true, description: 'Use for secondary affordances: reveal-on-hover row actions (edit/copy/remove on list / table rows) + overlay controls on card / media tile (e.g. Thumbnail remove button).' },
      { guidance: true, description: 'Gate reveal w/ isEnabled when a consumer prop decides revealed-on-hover vs always shown; can change at any time.' },
      { guidance: true, description: 'Pass isLayoutPreserved for absolutely-positioned / overlay content to reserve its box + avoid layout shift.' },
      { guidance: true, description: 'Set hoverDelay (100-250ms) on rows in a long list so a travelling cursor does not light up every row; keyboard + touch still reveal immediately.' },
      { guidance: true, description: 'forceState when something else owns the interaction (drag, scroll / motion gate, open row menu); forceVisibility when one element should ignore the container.' },
      { guidance: false, description: 'Reach past the API into private custom properties (--_reveal-opacity etc) to suppress a reveal; use forceState / forceVisibility.' },
      { guidance: false, description: 'Use to hide content that must always be discoverable; keep essential actions visible instead of gating behind hover.' },
    ],
  },
};
