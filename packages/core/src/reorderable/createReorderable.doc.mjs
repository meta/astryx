// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'createReorderable',
  displayName: 'createReorderable',
  // A factory documented as a hook: listed with the utilities, as useLayer
  // is, not as a tile in the components gallery.
  group: 'Utilities',
  keywords: [
    'reorder',
    'reorderable',
    'drag',
    'sort',
    'list',
    'handle',
    'grip',
    'move',
    'UIKit',
    'UITableView',
    'touch',
    'keyboard',
  ],
  params: [
    {
      name: 'onReorder',
      type: '(move: {key: Key; to: number}) => void',
      description:
        "Called once per committed move (a drop, or each move in reorder mode) with the moved item's key and its index after the move, in the full order of the collection's items. Apply it by rendering the items in their new order. A cancelled move calls nothing. The latest function given is the one called, so the object may be made on every render.",
      required: true,
    },
    {
      name: 'isReorderable',
      type: '(key: Key) => boolean',
      description:
        'Whether the item with this key can move. An item it rejects shows no handle and cannot be picked up; one at either end of the collection also bounds the others, so nothing drops beyond it and a keyboard move into it is refused. Every item moves without it.',
    },
  ],
  returns: [
    {
      name: 'reorderable',
      type: 'Reorderable',
      description:
        "The collection's reorder behavior: pass it as `List`'s `reorderable` prop, with an `itemKey` on each `ListItem`. Make it once per collection (with useMemo); one made on every render still works. Its one method, `start(key)`, enters reorder mode for that item from your own UI (a Move item in its context menu, a toolbar button): the focus moves to its handle, as activating it does; a key that cannot move or is not mounted does nothing and warns in development. One object may serve several collections, each reordering on its own; `start` then uses the one mounted last.",
    },
  ],
  usage: {
    description:
      "Makes a collection's rows reorderable. On a touch screen a finger held still on a row's handle for a moment picks it up (a flick on the handle still scrolls): the row stays in its place, dimmed, while a copy of it follows the finger and an accent line marks where it would land; the other rows stay still, the page scrolls near its edges, and on release the rows rearrange. A mouse drags a handle at once the same way, and the rows take their places without motion; a cancelled drag puts everything back at once. Without a drag, the handle toggles reorder mode for its row (a click, Space or Enter): each arrow key moves the row a place at once, and Escape or another activation ends the mode, keeping the moves; screen readers hear each move with the row's place and neighbours, and a hint shows the moves and Done as buttons, for taps alone. The reorder code ships with this function: a collection without the prop loads none of it.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Give each row a stable key from your data, a string or a number (`itemKey={item.id}`), and apply each move by rendering the items in their new order in the same task.',
      },
      {
        guidance: true,
        description:
          'Use `isReorderable` for rows that must stay put, such as a pinned first row.',
      },
      {
        guidance: true,
        description:
          "Offer reorder mode from your own UI too, such as a row's context menu, with `reorderable.start(item.id)`.",
      },
      {
        guidance: false,
        description:
          "Use React's `key` as the reorder key, or index-based keys: a move changes every index after it.",
      },
    ],
  },
  relatedComponents: ['List'],
  importPath: '@astryxdesign/core',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    "A collection's reorder behavior, for List's reorderable prop; ListItem itemKey on each row.",
  paramDescriptions: {
    onReorder:
      '({key, to}) once per committed move; to is the index after the move.',
    isReorderable:
      '(key) => boolean; a rejected row has no handle, and at an end bounds the drop.',
  },
  returnDescriptions: {
    reorderable:
      "pass as List's reorderable prop; start(key) enters reorder mode from your own UI.",
  },
  usage: {
    description:
      'UIKit edit-mode reorder: hold then drag (touch), drag (mouse); without a drag, the handle toggles reorder mode (click, Space, Enter), arrows move, Escape ends.',
    bestPractices: [
      {
        guidance: true,
        description: 'Stable data keys as itemKey; apply the move at once.',
      },
      {
        guidance: false,
        description: "React's key or indexes as reorder keys.",
      },
    ],
  },
};
