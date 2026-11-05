// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docs = {
  name: 'Layer',
  displayName: 'Layer',
  group: 'Utilities',
  category: 'Utility',
  keywords: [
    'layer',
    'overlay',
    'popover',
    'positioning',
    'anchor',
    'floating',
    'dropdown',
    'popper',
    'popup',
    'portal',
  ],
  usage: {
    description:
      'Layer utilities provide the app-level provider used by overlay systems. Use LayerProvider at the app root for toast/layer configuration; use higher-level Popover, HoverCard, or Tooltip APIs for most overlay UI. Rendered layer content, not the provider’s application subtree, uses theme body text defaults and exits ancestor surface/group membership. Establish intentional groups and complete required providers inside each layer. Every anchored layer keeps a gutter from each viewport edge — the spacing-4 step or the device safe-area inset, whichever is larger — and is capped to the viewport, never to the room beside its trigger: an explicit width renders at its size, flips when it does not fit beside the trigger, and slides into view when it fits on neither side. An app that floats a persistent bar over a viewport edge declares it once as inset on LayerProvider (blockStart, blockEnd, inlineStart, inlineEnd); each edge adds to that edge\u2019s gutter for every anchored layer and moves the toast viewport by the same amount, and defaults to zero. The inset is app configuration, not a theme value.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Declare a persistent bar floating over the viewport once, as inset on LayerProvider; every anchored layer and toast then stays clear of it.',
      },
      {
        guidance: true,
        description:
          'Use LayerProvider once near the app root when you need shared toast/layer configuration.',
      },
      {
        guidance: true,
        description:
          'Build on higher-level components like Popover, HoverCard, and Tooltip for common overlay patterns.',
      },
      {
        guidance: false,
        description:
          'Add nested LayerProvider instances: nested providers are ignored and add unnecessary tree depth.',
      },
    ],
  },
  components: [
    {
      name: 'LayerProvider',
      displayName: 'Layer Provider',
      description:
        'App-level provider for layer systems such as toast viewports and imperative modals. Nested providers pass through.',
      props: [
        {
          name: 'children',
          type: 'ReactNode',
          description:
            'Application subtree that can use the shared layer context.',
          required: true,
        },
        {
          name: 'toast',
          type: 'LayerToastConfig',
          description:
            'Toast viewport configuration. Controls position, maxVisible, and a toast-only inset that overrides the provider inset per edge for toasts shown through useToast.',
        },
        {
          name: 'inset',
          type: 'LayerInset',
          description:
            'A persistent bar floating over a viewport edge, declared once: blockStart, blockEnd, inlineStart, inlineEnd as pixel numbers or CSS lengths. Each edge adds to the gutter every anchored layer keeps from that edge and moves the toast viewport by the same amount. Defaults to zero on every edge.',
        },
      ],
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  usage: {
    description:
      'App-level provider for overlay systems. Use LayerProvider at app root for toast/layer config; use Popover/HoverCard/Tooltip for most overlay UI. Layer content uses theme body defaults and exits ancestor surface/group membership; establish intentional groups and complete required providers inside it. The application subtree is unchanged.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use LayerProvider once near app root for shared toast/layer config.',
      },
      {
        guidance: true,
        description:
          'Use Popover/HoverCard/Tooltip for common overlay patterns.',
      },
      {
        guidance: false,
        description: 'Add nested LayerProvider instances.',
      },
    ],
  },
  components: [
    {
      name: 'LayerProvider',
      description: 'App-level provider for toast/layer systems.',
      propDescriptions: {
        children: 'application subtree using shared layer context',
        toast: 'toast viewport config: position, maxVisible, inset',
        inset:
          'persistent bar over a viewport edge, declared once for layers and toasts',
      },
    },
  ],
};
