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
  ],
  usage: {
    description: 'Reusable hook that encapsulates the collapsible state machine. Supports three modes: group-controlled (inside CollapsibleGroup), controlled (isOpen + onOpenChange), and uncontrolled (self-managed with defaultIsOpen). Used internally by Card and Section.',
    bestPractices: [
      {guidance: true, description: 'Use the hook directly when building custom collapsible components that need Astryx collapsible behavior without Collapsible wrapper.'},
      {guidance: true, description: 'For accordion behavior, wrap items in CollapsibleGroup and pass unique value props.'},
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
  },
  returnDescriptions: {
    isEnabled: 'whether collapsible behavior active.',
    isOpen: 'whether content currently expanded.',
    toggle: 'toggle open/closed. Dispatches to group, controlled callback / internal state.',
  },
  usage: {
    description: 'Encapsulates collapsible state machine. 3 modes: group-controlled (inside CollapsibleGroup), controlled (isOpen + onOpenChange), uncontrolled (self-managed w/ defaultIsOpen). Used internally by Card + Section.',
    bestPractices: [
      {guidance: true, description: 'Use directly when building custom collapsible components needing Astryx collapsible behavior w/o Collapsible wrapper.'},
      {guidance: true, description: 'For accordion behavior, wrap items in CollapsibleGroup + pass unique value props.'},
      {guidance: false, description: 'Pass local open state or callbacks expecting them to run for a value-bound group item; the group owns state + notifications.'},
      {guidance: false, description: 'Implement your own open/close state when useCollapsible already provides it; hook handles group coordination automatically.'},
    ],
  },
};
