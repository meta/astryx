// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useCollapsible',
  displayName: 'useCollapsible',
  group: 'Collapsible',
  keywords: ['collapsible', 'collapse', 'expand', 'toggle', 'accordion', 'disclosure', 'fold'],
  params: [
    {
      name: 'isCollapsible',
      type: "boolean | CollapsibleConfig",
      description: 'Enable collapsible behavior. true = self-managed (starts open). Pass config object for controlled mode or custom defaults.',
    },
    {
      name: 'value',
      type: 'string',
      description: 'Unique identifier within an CollapsibleGroup. When present and inside a group, state is managed by the group.',
    },
    {
      name: 'hasContentAnimation',
      type: 'boolean',
      description: 'Whether the element that gets contentProps plays its own CSS animation when it opens and closes. With it, isEntering and isExiting stay true while that animation plays, and isPresent stays true until the close animation ends or is cancelled. A mount starts no animation phase. Under Reduce Motion, or when no animation runs, the open and close end at once.',
      default: 'false',
    },
    {
      name: 'contentHeightProperty',
      type: '`--${string}`',
      description: "A CSS custom property for the content's natural height. At each open, and at each close that keeps the children, the hook measures the height once, with the content's animation suppressed for the read, and writes it to this property on the content element as a px value that height can take. Keyframes grow from 0px to var(<property>) and shrink back.",
    },
  ],
  returns: [
    {
      name: 'isEnabled',
      type: 'boolean',
      description: 'Whether collapsible behavior is active.',
    },
    {
      name: 'isOpen',
      type: 'boolean',
      description: 'Whether the content is currently expanded.',
    },
    {
      name: 'toggle',
      type: '() => void',
      description: 'Toggle open/closed state. Dispatches to group, controlled callback, or internal state.',
    },
    {
      name: 'triggerProps',
      type: "{type: 'button'; 'aria-expanded': boolean; 'aria-controls': string; onClick: () => void}",
      description: 'Props for the trigger. Spread them on a <button>, or on a component that renders one, such as Button: the whole row can be the trigger. aria-expanded follows isOpen, and aria-controls names the content element.',
    },
    {
      name: 'contentProps',
      type: '{id: string; hidden: boolean; inert: boolean; ref: RefCallback<HTMLElement>}',
      description: 'Props for the content element. Render that element at all times, so aria-controls always names it. It is hidden once the content is closed and its close animation is over, and inert while the close animation plays.',
    },
    {
      name: 'isPresent',
      type: 'boolean',
      description: "Whether to render the content's children: while open, and while the close animation plays. A closed content element holds nothing, so closed rows mount no subtree.",
    },
    {
      name: 'isEntering',
      type: 'boolean',
      description: "Whether the content's open animation is playing (hasContentAnimation). Apply the open keyframes only while it is true, so content that mounts open does not replay them.",
    },
    {
      name: 'isExiting',
      type: 'boolean',
      description: "Whether the content's close animation is playing (hasContentAnimation). Apply the close keyframes only while it is true.",
    },
  ],
  usage: {
    description: 'Reusable hook that encapsulates the collapsible state machine. Supports three modes: group-controlled (inside CollapsibleGroup), controlled (isOpen + onOpenChange), and uncontrolled (self-managed with defaultIsOpen). Its triggerProps and contentProps wire a trigger and content you render yourself, such as a list row whose whole row is the button, and its content mounts nothing while closed. Used internally by Collapsible and Banner.',
    bestPractices: [
      {guidance: true, description: 'Use the hook directly when building custom collapsible components that need Astryx collapsible behavior without Collapsible wrapper.'},
      {guidance: true, description: 'Spread triggerProps on a <button> and contentProps on the element that holds the content, and render the children only while isPresent.'},
      {guidance: true, description: 'To run your own trigger onClick too, pass composeEventHandlers(yourHandler, triggerProps.onClick) from @astryxdesign/core/utils. An onClick after the spread replaces the toggle.'},
      {guidance: true, description: 'For a measured grow and fade, set hasContentAnimation and contentHeightProperty, and key the open and close keyframes on isEntering and isExiting. Put the animation on the content element itself.'},
      {guidance: true, description: 'For accordion behavior, wrap items in CollapsibleGroup and pass unique value props.'},
      {guidance: false, description: 'Render the content element only while open; aria-controls then names an element that does not exist.'},
      {guidance: false, description: 'Pass local isOpen, defaultIsOpen, or onOpenChange expecting them to run for a value-bound group item; the group owns that state and notification path.'},
      {guidance: false, description: 'Implement your own open/close state when useCollapsible already provides it; the hook handles group coordination automatically.'},
    ],
  },
  relatedComponents: ['Collapsible', 'Card', 'Section'],
  relatedHooks: [],
  importPath: '@astryxdesign/core/Collapsible',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description: 'Encapsulates collapsible state machine. 3 modes: group-controlled (inside CollapsibleGroup), controlled (isOpen + onOpenChange), uncontrolled (self-managed w/ defaultIsOpen). Used internally by Card + Section.',
  paramDescriptions: {
    isCollapsible: 'enable collapsible behavior. true = self-managed (starts open). Pass config object for controlled mode / custom defaults.',
    value: 'unique id within CollapsibleGroup. When present + inside group, state managed by group.',
    hasContentAnimation: 'content element plays its own CSS open/close animation: isEntering/isExiting while it runs, isPresent through the close. No animation / Reduce Motion: ends at once. Mount starts none.',
    contentHeightProperty: 'custom property that gets the content natural height (px) at each open + each close that keeps the children, read w/ animation suppressed, for grow/shrink keyframes.',
  },
  returnDescriptions: {
    isEnabled: 'whether collapsible behavior active.',
    isOpen: 'whether content currently expanded.',
    toggle: 'toggle open/closed. Dispatches to group, controlled callback / internal state.',
    triggerProps: 'spread on a <button> (whole row can be trigger): type, aria-expanded, aria-controls, onClick.',
    contentProps: 'spread on the always-rendered content element: id, hidden, inert (during close), ref.',
    isPresent: 'render children only while true: open, or close animation playing.',
    isEntering: 'open animation playing; key open keyframes on it.',
    isExiting: 'close animation playing; key close keyframes on it.',
  },
  usage: {
    description: 'Encapsulates collapsible state machine. 3 modes: group-controlled (inside CollapsibleGroup), controlled (isOpen + onOpenChange), uncontrolled (self-managed w/ defaultIsOpen). triggerProps + contentProps wire your own trigger + content; closed content mounts nothing. Used internally by Collapsible + Banner.',
    bestPractices: [
      {guidance: true, description: 'Use directly when building custom collapsible components needing Astryx collapsible behavior w/o Collapsible wrapper.'},
      {guidance: true, description: 'triggerProps on a <button>, contentProps on the content element; render children only while isPresent.'},
      {guidance: true, description: 'Own trigger onClick: composeEventHandlers(yours, triggerProps.onClick) from @astryxdesign/core/utils; an onClick after the spread replaces the toggle.'},
      {guidance: true, description: 'Measured grow/fade: hasContentAnimation + contentHeightProperty; key keyframes on isEntering/isExiting, on the content element itself.'},
      {guidance: true, description: 'For accordion behavior, wrap items in CollapsibleGroup + pass unique value props.'},
      {guidance: false, description: 'Render the content element only while open; aria-controls then names a missing element.'},
      {guidance: false, description: 'Pass local open state or callbacks expecting them to run for a value-bound group item; the group owns state + notifications.'},
      {guidance: false, description: 'Implement your own open/close state when useCollapsible already provides it; hook handles group coordination automatically.'},
    ],
  },
};
