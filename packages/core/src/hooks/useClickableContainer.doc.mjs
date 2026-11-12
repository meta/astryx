// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useClickableContainer',
  displayName: 'useClickableContainer',
  keywords: ['click', 'container', 'card', 'pressable', 'interactive', 'nested', 'link', 'button', 'delegate'],
  params: [
    {
      name: 'options',
      type: 'UseClickableContainerOptions',
      description: 'Configuration object for the clickable container.',
      required: true,
    },
    {
      name: 'options.containerRef',
      type: 'RefObject<HTMLElement | null>',
      description: 'Ref to the outer container element.',
      required: true,
    },
    {
      name: 'options.interactiveRef',
      type: 'RefObject<HTMLElement | null>',
      description: 'Ref to the primary interactive element inside (link, button). If no onClick or href is provided, clicks are proxied to this element.',
      required: false,
    },
    {
      name: 'options.onClick',
      type: '(event: MouseEvent<HTMLElement>) => void',
      description: 'Click handler fired when the container surface (not a nested interactive element) is clicked.',
      required: false,
    },
    {
      name: 'options.href',
      type: 'string',
      description: 'Navigation URL. When provided, clicking the container navigates to this URL.',
      required: false,
    },
    {
      name: 'options.target',
      type: 'string',
      description: "Link target (e.g., '_blank'). Used with href for navigation behavior.",
      required: false,
    },
    {
      name: 'options.disabled',
      type: 'boolean',
      description: 'Whether the container is disabled.',
      default: 'false',
      required: false,
    },
  ],
  returns: [
    {
      name: 'onClick',
      type: '(event: MouseEvent<HTMLElement>) => void',
      description: 'Click handler to attach to the container element.',
    },
    {
      name: 'onMouseUp',
      type: '(event: MouseEvent<HTMLElement>) => void',
      description: 'Mouse up handler to attach to the container (handles middle-click navigation for href).',
    },
    {
      name: 'onPointerDown',
      type: '(event: PointerEvent<HTMLElement>) => void',
      description: 'Pointer down handler to attach to the container. On a container that paints its press with usePressFeedback, it drops a touch press that starts on a nested interactive element, which does not activate the container. A mouse :active press paint is unchanged. Without it, the container keeps its click rules and its pressed state for every press.',
    },
  ],
  usage: {
    description:
      'Makes a container element clickable while preserving nested interactive element behavior. Solves the "nested interactive elements" problem: when a card is clickable but contains buttons/links, clicking those should NOT trigger the card\'s action. Detects interactive ancestors between the click target and the container, and ignores text selections. Supports href navigation (including middle-click and Ctrl/Cmd+click for new tabs).',
    bestPractices: [
      { guidance: true, description: 'Attach onClick, onMouseUp and onPointerDown to the container element: full click handling including middle-click, and no touch pressed state for a press on a nested control.' },
      { guidance: true, description: 'Use inside ClickableCard or SelectableCard for the standard card interaction pattern.' },
      { guidance: true, description: 'For a pressable surface without Card chrome, such as a quoted message that jumps on press, compose it yourself: this hook on the surface; `usePressFeedback()` and `interactionOverlayStyles.backgroundColor` (from `@astryxdesign/core/utils`) on the same element for the hover tint and touch press; a native `<button>` (or an `<a>` for a destination) inside `VisuallyHidden` as the named control and interactiveRef; and `focusOutlineStyles.focusWithin` (from `@astryxdesign/core/utils`) on the surface for the shared focus ring, the one ClickableCard draws. The `Core/Hooks/useClickableContainer` story has the full recipe.' },
      { guidance: false, description: 'Use when the entire container is a single interactive element; just use a <button> or <a> directly.' },
    ],
  },
  relatedComponents: ['ClickableCard', 'SelectableCard'],
  relatedHooks: ['useInputContainer'],
  importPath: '@astryxdesign/core/hooks',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Makes container element clickable while preserving nested interactive element behavior. Solves "nested interactive elements" problem: when card is clickable but contains buttons/links, clicking those must NOT trigger card\'s action. Detects interactive ancestors between click target + container, ignores text selections. Supports href navigation (incl. middle-click + Ctrl/Cmd+click for new tabs).',
  paramDescriptions: {
    options: 'config for clickable container.',
    'options.containerRef': 'ref to outer container element.',
    'options.interactiveRef': 'ref to primary interactive element inside (link, button). If no onClick / href provided, clicks proxied to this element.',
    'options.onClick': 'click handler fired when container surface (not nested interactive element) clicked.',
    'options.href': 'navigation URL. When provided, clicking container navigates to it.',
    'options.target': "link target (e.g. '_blank'). Used w/ href for navigation behavior.",
    'options.disabled': 'whether container disabled.',
  },
  returnDescriptions: {
    onClick: 'click handler for container element.',
    onMouseUp: 'mouse up handler for container (handles middle-click navigation for href).',
    onPointerDown: 'pointer down handler for container: drops usePressFeedback touch press starting on nested interactive element; mouse :active paint unchanged.',
  },
  usage: {
    description:
      'Makes container element clickable while preserving nested interactive element behavior. Solves "nested interactive elements" problem: when card is clickable but contains buttons/links, clicking those must NOT trigger card\'s action. Detects interactive ancestors between click target + container, ignores text selections. Supports href navigation (incl. middle-click + Ctrl/Cmd+click for new tabs).',
    bestPractices: [
      { guidance: true, description: 'Attach onClick + onMouseUp + onPointerDown to container element: full click handling incl. middle-click, no touch pressed state for press on nested control.' },
      { guidance: true, description: 'Use inside ClickableCard / SelectableCard for standard card interaction pattern.' },
      { guidance: true, description: 'Pressable surface w/o Card chrome (e.g. quoted message jumping on press): this hook on surface; usePressFeedback() + interactionOverlayStyles.backgroundColor on same element; native <button> (or <a> for destination) inside VisuallyHidden as named control + interactiveRef; focusOutlineStyles.focusWithin on surface for shared focus ring (the one ClickableCard draws). Full recipe: Core/Hooks/useClickableContainer story.' },
      { guidance: false, description: 'Use when entire container is single interactive element; just use <button> / <a> directly.' },
    ],
  },
};
