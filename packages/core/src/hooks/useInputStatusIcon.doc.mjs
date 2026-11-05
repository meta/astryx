// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useInputStatusIcon',
  displayName: 'useInputStatusIcon',
  keywords: [
    'input',
    'status',
    'icon',
    'error',
    'warning',
    'success',
    'validation',
    'tooltip',
    'info tip',
    'field',
    'describedby',
    'accessibility',
    'a11y',
  ],
  params: [
    {
      name: 'options',
      type: 'UseInputStatusIconOptions',
      description: 'Configuration object.',
      required: true,
    },
    {
      name: 'options.status',
      type: 'InputStatus',
      description:
        "The input's status (type plus message), or undefined when there is none.",
    },
    {
      name: 'options.statusVariant',
      type: "'attached' | 'detached' | 'tooltip'",
      description: 'How the status is presented relative to the input.',
      default: "'attached'",
    },
    {
      name: 'options.isInGroup',
      type: 'boolean',
      description:
        'Whether the input sits inside an InputGroup, which owns status rendering itself.',
      default: 'false',
    },
    {
      name: 'options.size',
      type: 'IconSize',
      description: 'Size of the on-field icon.',
      default: "'md'",
    },
  ],
  returns: [
    {
      name: 'statusIcon',
      type: 'ReactNode',
      description:
        'The affordance to render inside the input container: a plain icon, or a focusable info-tip button with its tooltip. Null when no icon should render.',
    },
    {
      name: 'describedBy',
      type: 'string | undefined',
      description:
        "ID to add to the input's aria-describedby, present exactly when a tooltip element is in the DOM, so there is never a dangling reference.",
    },
  ],
  usage: {
    description:
      'Builds the on-field status affordance for a bordered input and its accessibility wiring, so every input in the family behaves the same for a given status. The attached variant renders a plain glyph and leaves the text to the message box; the detached variant renders nothing here, because the message box already carries its own icon; the tooltip variant renders a real focusable button whose tooltip is reachable by keyboard, pointer, touch and assistive tech. Use it when building a bordered input, not for field-level messaging.',
    bestPractices: [
      {
        guidance: true,
        description:
          "Render statusIcon inside the input container and merge describedBy into the control's aria-describedby list.",
      },
      {
        guidance: true,
        description:
          'Let it decide when nothing should render; pass isInGroup and the variant through rather than branching at the call site.',
      },
      {
        guidance: false,
        description:
          'Use it to convey the status by icon alone; the tooltip variant is the only one that carries the message, so the others still need a message box.',
      },
    ],
  },
  relatedComponents: [
    'TextInput',
    'TextArea',
    'NumberInput',
    'DateInput',
    'FileInput',
    'FieldStatus',
    'InputGroup',
  ],
  relatedHooks: ['useInputContainer'],
  importPath: '@astryxdesign/core/hooks',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'On-field status affordance + a11y wiring for bordered inputs. attached = plain glyph (message box carries text); detached = nothing (box has own icon); tooltip = focusable info-tip button reachable by keyboard / pointer / touch / AT.',
  paramDescriptions: {
    options: 'config.',
    'options.status': 'input status (type + message), or undefined.',
    'options.statusVariant': 'how status is presented relative to input.',
    'options.isInGroup': 'inside InputGroup, which owns status rendering.',
    'options.size': 'on-field icon size.',
  },
  returnDescriptions: {
    statusIcon:
      'node to render inside input container; null when nothing should render.',
    describedBy:
      'id for aria-describedby, present exactly when the tooltip element is in the DOM.',
  },
  usage: {
    description:
      'Use when building a bordered input so all inputs behave the same per status; not for field-level messaging.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Render statusIcon in the input container; merge describedBy into aria-describedby.',
      },
      {
        guidance: true,
        description:
          'Pass isInGroup + variant through; let the hook decide when nothing renders.',
      },
      {
        guidance: false,
        description:
          'Rely on the icon alone for meaning; only the tooltip variant carries the message.',
      },
    ],
  },
};
