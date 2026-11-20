// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useComponentIcon',
  displayName: 'useComponentIcon',
  group: 'Icon',
  keywords: [
    'icon',
    'component icon',
    'componentIcons',
    'icon slot',
    'theme icons',
    'number-input-stepper',
  ],
  params: [
    {
      name: 'slot',
      type: 'ComponentIconSlotName',
      description:
        "The component icon slot to resolve, such as 'number-input-stepper'. A package declares a slot by augmenting `ComponentIconSlotMap` from `@astryxdesign/core/Icon`.",
      required: true,
    },
    {
      name: 'state',
      type: 'ComponentIconSlotState<Slot>',
      description:
        "The slot's state, or `undefined` for a stateless slot. A stateful slot's map value lists these readonly fields, and a theme's slot function receives them.",
      required: true,
    },
    {
      name: 'fallback',
      type: 'ComponentIconFallback',
      description:
        "The name the component renders when the theme maps nothing: a shared icon name, a namespaced extension key, `null` for no icon, or a partial request with its own `variant` and `size`.",
      required: true,
    },
  ],
  returns: [
    {
      name: 'resolved',
      type: 'ResolvedComponentIcon',
      description:
        "The `icon` name to render through Icon, plus the `variant` and `size` the theme's request chose. A request field the theme leaves out keeps the component's own value, and `icon: null` means the slot draws nothing.",
    },
  ],
  usage: {
    description:
      "Resolves a component icon slot against the nearest Theme, applying `componentIcons[slot]` to the component's own fallback. Pair it with `<Icon icon={resolved.icon} variant={resolved.variant} size={resolved.size} />`, or render the `<ComponentIcon>` element, which calls this hook and renders Icon for you. A package outside Core uses one of them so a theme can map its slots; Core components already render through ComponentIcon.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Prefer <ComponentIcon slot={...} state={...} fallback={...} /> when the glyph is the whole element. It resolves the slot and renders Icon in one step, and it lets icon content the caller passed win.',
      },
      {
        guidance: true,
        description:
          'Pass the component’s own name as `fallback` so a theme that maps nothing still draws the shipped glyph. A fallback may be the namespaced key the slot replaces, which keeps an existing override rendering.',
      },
      {
        guidance: false,
        description:
          'Read `theme.componentIcons` directly to draw a slot. Only this hook and ComponentIcon may call a theme’s slot functions, and a slot function receives the state the component passes.',
      },
    ],
  },
  relatedComponents: ['Icon', 'NumberInput', 'Theme'],
  relatedHooks: ['useIcon', 'useTheme'],
  importPath: '@astryxdesign/core/Icon',
  category: 'utilities',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    "Resolves a component icon slot against the nearest Theme: `componentIcons[slot]` applied to the component's fallback. Returns the `icon`, `variant`, and `size` to render through Icon. Pair with `<Icon icon={resolved.icon} ... />`, or render `<ComponentIcon>` which does both. Only this hook and ComponentIcon may call a theme's slot functions.",
  paramDescriptions: {
    slot: "component icon slot name ('number-input-stepper'); declare one by augmenting `ComponentIconSlotMap`.",
    state: "the slot's state, or undefined when stateless.",
    fallback:
      'shared icon name, namespaced key, null, or a request with its own variant and size.',
  },
  returnDescriptions: {
    resolved:
      "icon name to render, plus the theme request's variant and size; icon: null draws nothing.",
  },
  usage: {
    description:
      'Slot to Icon props via the nearest Theme. Use <ComponentIcon> unless the icon needs custom rendering. Fallback keeps the shipped glyph when a theme maps nothing.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Prefer <ComponentIcon> so the slot resolves and Icon renders in one element.',
      },
      {
        guidance: true,
        description:
          "Pass the component's own name as the fallback so an unmapped slot still draws.",
      },
      {
        guidance: false,
        description:
          "Read theme.componentIcons directly; a slot function takes the component's state.",
      },
    ],
  },
};
