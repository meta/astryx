// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'createSwipe',
  displayName: 'createSwipe',
  // A constructor documented as a hook: listed with the utilities, beside the
  // rows that take its value, not as a tile in the components gallery.
  group: 'Utilities',
  keywords: [
    'swipe',
    'swipe actions',
    'row actions',
    'trailing actions',
    'leading actions',
    'list row',
    'archive',
    'delete',
    'gesture',
    'touch',
  ],
  params: [
    {
      name: 'options.leading',
      type: 'ReadonlyArray<SwipeAction>',
      description:
        "The verbs a drag toward the inline end uncovers (rightward in left-to-right text), outermost last. Each is `{id?, label, icon?, onActivate, isDisabled?, variant?: 'neutral' | 'accent' | 'destructive', hasRemoval?}`: `label` names the state the verb reaches and is the button's accessible name, `onActivate` fires on a tap on a resting entry, on a full swipe, or on a `commit` release, once the row's content has left its box when the row slides out, and `hasRemoval` only says the row holds out after the action fires instead of springing back.",
      required: false,
    },
    {
      name: 'options.trailing',
      type: 'ReadonlyArray<SwipeAction>',
      description:
        'The verbs a drag toward the inline start uncovers (leftward in left-to-right text), outermost last, in the same shape as `leading`.',
      required: false,
    },
    {
      name: 'options.swipeBehavior',
      type: "'reveal' | 'commit'",
      description:
        'What a swipe does, on both sides. `reveal` rests the row open with every entry a real button: as in a UIKit list, a fast release goes the way it moves (a flick opens the row, a flick back closes it), a slow one past half the panel opens it, and a full swipe fires the outermost: dragged on past the confirm point, the row runs ahead and the outermost entry covers its place, and letting go there fires it; backing out closes the row; a disabled outermost entry never confirms. `commit` only fires the outermost on a full swipe, sliding the row out, with nothing resting and a presentational panel; it fits one entry per side and warns in development with more.',
      default: "'reveal'",
      required: false,
    },
  ],
  returns: [
    {
      name: 'Swipe',
      type: 'Swipe',
      description:
        'The row’s swipe actions, with nothing in them to read. Pass the value as `swipe` on `Item` or `ListItem`; a value made any other way swipes nothing.',
    },
  ],
  usage: {
    description:
      'Gives a list row the verbs a sideways swipe uncovers, the way a mail row reveals Archive and Delete on a phone: `<ListItem label="Inbox" swipe={createSwipe({trailing: [{label: \'Archive\', onActivate: archive}]})} />`. A finger, a pen or a trackpad’s two-finger swipe drags the row; a mouse never does. A plain function, not a hook: call it at module scope or inline in a render, where a new value neither closes an open row nor restarts its settle, and it does no DOM work. The swipe’s code comes with this function, so a row given `swipe` is swipeable at its first paint and an app that never imports it ships none of it.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Give every swipe action a second home in the row, such as a menu or a button in endContent: a verb reachable only by swipe is unreachable by keyboard and by mouse.',
      },
      {
        guidance: true,
        description:
          'Put the rows in a List, which clips them in the inline axis; any other container sets overflow-inline: clip once.',
      },
      {
        guidance: false,
        description:
          'Give a `commit` side more than one entry: only the outermost fires, so the others have no touch path.',
      },
    ],
    accessibility: [
      {
        name: 'Keyboard and assistive technology',
        category: 'Keyboard',
        description:
          'The swipe is a touch accelerator. A closed row’s panels are out of the accessibility tree and the tab order; an open row’s entries are real buttons under `reveal`, named by their labels, and Escape closes the row. Every verb must also be reachable through the row’s own content.',
      },
      {
        name: 'Reduce Motion',
        category: 'Content',
        criterion: '2.3.3 Animation from Interactions',
        description:
          'When the person asks for reduced motion, the row reaches its resting place with no travel or spring and cross-fades when a finger started the swipe.',
      },
    ],
  },
  relatedComponents: ['Item', 'List'],
  importPath: '@astryxdesign/core/Swipe',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    "Makes a row's swipe actions: pass the value as swipe on Item or ListItem.",
  paramDescriptions: {
    'options.leading':
      'Entries a drag toward the inline end uncovers, outermost last.',
    'options.trailing':
      'Entries a drag toward the inline start uncovers, outermost last.',
    'options.swipeBehavior':
      "'reveal' (rest open, entries tappable; default) or 'commit' (full swipe fires the outermost; one entry per side).",
  },
  returnDescriptions: {
    Swipe: 'Opaque; pass as swipe.',
  },
  usage: {
    description:
      'Touch accelerator for list rows; a mouse never swipes. Callable inline; no DOM work; its code ships only where it is imported.',
    bestPractices: [
      {guidance: true, description: 'Give each verb a second home in the row.'},
      {guidance: false, description: 'Several entries on a commit side.'},
    ],
  },
};
