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
      type: 'ReadonlyArray<SwipeAction<Id>>',
      description:
        "The verbs a drag toward the inline end uncovers (rightward in left-to-right text), outermost last. Each is `{id, label, icon?, onActivate, isDisabled?, variant?: ItemSwipeActionVariant, hasRemoval?}`: `id` names the action, and the swipe's type carries the ids, so an id it does not have fails to compile. `label` names the state the verb reaches and is the button's accessible name. `onActivate({id, itemKey})` fires on a tap on a resting entry, on a full swipe, or on a `commit` release, once the row's content has left its box when the row slides out; `itemKey` is the `ListItem`'s, `undefined` on a plain `Item`. `hasRemoval` only says the row holds out after the action fires instead of springing back.",
      required: false,
    },
    {
      name: 'options.trailing',
      type: 'ReadonlyArray<SwipeAction<Id>>',
      description:
        'The verbs a drag toward the inline start uncovers (leftward in left-to-right text), outermost last, in the same shape as `leading`.',
      required: false,
    },
    {
      name: 'options.swipeBehavior',
      type: "'reveal' | 'commit'",
      description:
        'What a swipe does, on both sides. `reveal` rests the row open with every entry a real button. As in a UIKit list, a fast release goes the way it moves, and a slow one past half the panel opens the row. A fling never fires an entry. A long drag fires the outermost: past the confirm point the row runs ahead and the outermost entry covers its place. Letting go there fires it. Backing out closes the row, and a disabled outermost entry never confirms. On a side with two or more entries, only a drag that starts on the open row fires. `commit` fires the one entry of a side on a full swipe, sliding the row out, with nothing resting and a presentational panel. On a side with two or more entries it fires none and warns in development.',
      default: "'reveal'",
      required: false,
    },
  ],
  returns: [
    {
      name: 'Swipe',
      type: 'Swipe<Id>',
      description:
        'The row’s swipe actions, with nothing in them to read; its type carries the actions’ ids. Pass the value as `swipe` on `Item` or `ListItem`; a value made any other way swipes nothing. A new value with the same ids keeps an open row as it is, and one with other ids closes it.',
    },
  ],
  usage: {
    description:
      'Gives a list row the verbs a sideways swipe uncovers, the way a mail row reveals Archive and Delete on a phone: `const mail = createSwipe({trailing: [{id: \'archive\', label: \'Archive\', onActivate: ({itemKey}) => archive(itemKey)}]})`, then `<ListItem label="Inbox" itemKey={message.id} swipe={mail} />`. A finger, a pen or a trackpad’s two-finger swipe drags the row; a mouse never does. A plain function, not a hook, pure and cheap: define the swipe once at module scope, where each handler reads the row from `itemKey`, or in `useMemo` when its handlers need component state. A new value with the same ids neither closes an open row nor restarts its settle, and it does no DOM work. The swipe’s code comes with this function, so a row given `swipe` is swipeable at its first paint and an app that never imports it ships none of it.',
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
          'Give a `commit` side more than one entry: it fires none of them.',
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
      "'reveal' (rest open, entries tappable; default) or 'commit' (a full swipe fires the one entry of a side).",
  },
  returnDescriptions: {
    Swipe: 'Opaque; pass as swipe.',
  },
  usage: {
    description:
      'Touch accelerator for list rows; a mouse never swipes. Define once at module scope (handlers get {id, itemKey}) or in useMemo; no DOM work; its code ships only where it is imported.',
    bestPractices: [
      {guidance: true, description: 'Give each verb a second home in the row.'},
      {guidance: false, description: 'Several entries on a commit side.'},
    ],
  },
};
