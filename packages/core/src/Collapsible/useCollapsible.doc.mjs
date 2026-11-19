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
      type: '{id: string; hidden: boolean}',
      description: 'Props for the content element. Render that element at all times, so aria-controls always names it, and render its children only while isOpen: closed rows then mount no subtree. To animate the content, pass this result to useCollapsibleContentMotion and spread its contentProps instead.',
    },
  ],
  usage: {
    description: 'Reusable hook that encapsulates the collapsible state machine. Supports three modes: group-controlled (inside CollapsibleGroup), controlled (isOpen + onOpenChange), and uncontrolled (self-managed with defaultIsOpen). Its triggerProps and contentProps wire a trigger and content you render yourself, such as a list row whose whole row is the button, and its content mounts nothing while closed. Used internally by Collapsible and Banner.',
    bestPractices: [
      {guidance: true, description: 'Use the hook directly when building custom collapsible components that need Astryx collapsible behavior without Collapsible wrapper.'},
      {guidance: true, description: 'Spread triggerProps on a <button> and contentProps on the element that holds the content, and render the children only while isOpen.'},
      {guidance: true, description: 'To run your own trigger onClick too, pass composeEventHandlers(yourHandler, triggerProps.onClick) from @astryxdesign/core/utils. An onClick after the spread replaces the toggle.'},
      {guidance: true, description: 'For an open and close animation, add useCollapsibleContentMotion; pages that do not use it carry none of its code.'},
      {guidance: true, description: 'For accordion behavior, wrap items in CollapsibleGroup and pass unique value props.'},
      {guidance: false, description: 'Render the content element only while open; aria-controls then names an element that does not exist.'},
      {guidance: false, description: 'Pass local isOpen, defaultIsOpen, or onOpenChange expecting them to run for a value-bound group item; the group owns that state and notification path.'},
      {guidance: false, description: 'Implement your own open/close state when useCollapsible already provides it; the hook handles group coordination automatically.'},
    ],
  },
  relatedComponents: ['Collapsible', 'Card', 'Section'],
  relatedHooks: ['useCollapsibleContentMotion'],
  importPath: '@astryxdesign/core/Collapsible',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description: 'Encapsulates collapsible state machine. 3 modes: group-controlled (inside CollapsibleGroup), controlled (isOpen + onOpenChange), uncontrolled (self-managed w/ defaultIsOpen). Used internally by Card + Section.',
  paramDescriptions: {
    isCollapsible: 'enable collapsible behavior. true = self-managed (starts open). Pass config object for controlled mode / custom defaults.',
    value: 'unique id within CollapsibleGroup. When present + inside group, state managed by group.',
  },
  returnDescriptions: {
    isEnabled: 'whether collapsible behavior active.',
    isOpen: 'whether content currently expanded.',
    toggle: 'toggle open/closed. Dispatches to group, controlled callback / internal state.',
    triggerProps: 'spread on a <button> (whole row can be trigger): type, aria-expanded, aria-controls, onClick.',
    contentProps: 'spread on the always-rendered content element: id, hidden; render children only while isOpen.',
  },
  usage: {
    description: 'Encapsulates collapsible state machine. 3 modes: group-controlled (inside CollapsibleGroup), controlled (isOpen + onOpenChange), uncontrolled (self-managed w/ defaultIsOpen). triggerProps + contentProps wire your own trigger + content; closed content mounts nothing. Used internally by Collapsible + Banner.',
    bestPractices: [
      {guidance: true, description: 'Use directly when building custom collapsible components needing Astryx collapsible behavior w/o Collapsible wrapper.'},
      {guidance: true, description: 'triggerProps on a <button>, contentProps on the content element; render children only while isOpen.'},
      {guidance: true, description: 'Own trigger onClick: composeEventHandlers(yours, triggerProps.onClick) from @astryxdesign/core/utils; an onClick after the spread replaces the toggle.'},
      {guidance: true, description: 'Open/close animation: add useCollapsibleContentMotion (own import; unused pages carry none of it).'},
      {guidance: true, description: 'For accordion behavior, wrap items in CollapsibleGroup + pass unique value props.'},
      {guidance: false, description: 'Render the content element only while open; aria-controls then names a missing element.'},
      {guidance: false, description: 'Pass local open state or callbacks expecting them to run for a value-bound group item; the group owns state + notifications.'},
      {guidance: false, description: 'Implement your own open/close state when useCollapsible already provides it; hook handles group coordination automatically.'},
    ],
  },
};
