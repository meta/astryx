// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useLongPress',
  displayName: 'useLongPress',
  keywords: [
    'long press',
    'touch',
    'press and hold',
    'context menu',
    'mobile',
    'ios',
    'safari',
    'gesture',
    'tap',
  ],
  params: [
    {
      name: 'options',
      type: 'UseLongPressOptions',
      description: 'Configuration object.',
      required: true,
    },
    {
      name: 'options.onLongPress',
      type: '(point: {x: number; y: number}) => void',
      description:
        'Fired with the touch start point once the press is held for delayMs.',
      required: true,
    },
    {
      name: 'options.disabled',
      type: 'boolean',
      description: 'When true, the returned touch handlers are inert.',
      default: 'false',
    },
    {
      name: 'options.delayMs',
      type: 'number',
      description: 'Hold duration before the press fires, in milliseconds.',
      default: '500',
    },
    {
      name: 'options.moveCancelPx',
      type: 'number',
      description:
        'Movement past this distance on either axis cancels the press, treating it as a scroll or drag.',
      default: '10',
    },
  ],
  returns: [
    {
      name: 'handlers',
      type: 'UseLongPressHandlers',
      description:
        'onTouchStart, onTouchMove, onTouchEnd and onTouchCancel to spread onto the target element.',
    },
  ],
  usage: {
    description:
      'Detects a single-finger press-and-hold and reports where it happened, so touch users can reach affordances that a pointer gets from right-click. iOS Safari never synthesizes a contextmenu event on long-press, which makes this the only touch route into a cursor-positioned surface such as ContextMenu. The press cancels on movement, lift, multi-touch or unmount.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use the reported point to position the surface you open, so it appears under the finger.',
      },
      {
        guidance: true,
        description:
          'Pair it with the pointer contextmenu handler rather than replacing it; this hook only covers touch.',
      },
      {
        guidance: false,
        description:
          'Use it for the primary action of a control; press-and-hold is undiscoverable as the only way to do something.',
      },
    ],
  },
  relatedComponents: ['ContextMenu'],
  relatedHooks: ['useClickableContainer', 'useHotkeys'],
  importPath: '@astryxdesign/core/hooks',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Single-finger press-and-hold detection reporting the touch point. iOS Safari never fires contextmenu on long-press, so this is the only touch route to cursor-positioned surfaces. Cancels on move / lift / multi-touch / unmount.',
  paramDescriptions: {
    options: 'config.',
    'options.onLongPress': 'fired w/ touch start point after delayMs.',
    'options.disabled': 'true = handlers inert.',
    'options.delayMs': 'hold duration before firing, ms.',
    'options.moveCancelPx':
      'movement past this (px, either axis) cancels as scroll / drag.',
  },
  returnDescriptions: {
    handlers:
      'onTouchStart / onTouchMove / onTouchEnd / onTouchCancel to spread onto the element.',
  },
  usage: {
    description:
      'Touch press-and-hold for affordances a pointer reaches by right-click (e.g. ContextMenu). Reports the point so the surface opens under the finger.',
    bestPractices: [
      {
        guidance: true,
        description: 'Position the opened surface at the reported point.',
      },
      {
        guidance: true,
        description:
          'Pair w/ pointer contextmenu handler; this covers touch only.',
      },
      {
        guidance: false,
        description:
          'Make press-and-hold the only way to reach an action; it is undiscoverable.',
      },
    ],
  },
};
