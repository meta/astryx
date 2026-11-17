---
'@astryxdesign/core': patch
---

[feat] Swipe actions on `Item` and `ListItem` come from one prop, `swipe`, whose value `createSwipe` makes, from `@astryxdesign/core/Swipe` or the package root: `swipe={createSwipe({leading, trailing, swipeBehavior})}`. Each action has an `id`, and its `onActivate` receives `{id, itemKey}`: the action's `id` and the `ListItem`'s `itemKey`. So one definition at module scope serves every row; one whose handlers need component state goes in `useMemo`. The swipe's type carries the ids, so an id it does not have fails to compile. A new value with the same ids keeps an open row open, and one with other ids closes it. The swipe's code comes with `createSwipe`, so a row given `swipe` is swipeable at its first paint, and an app that never imports it ships none of it. The `swipeActions` and `swipeBehavior` props and the `ItemSwipeAction` and `ItemSwipeActions` types are deprecated (DEP-0017) and are removed in the next minor release. `ItemSwipeActionVariant` and `ItemSwipeBehavior` stay, and the new API uses them. Until then the deprecated ones keep working, with the swipe behavior this release gives every row, and when `swipe` is set too, `swipe` wins. `astryx upgrade` rewrites static uses and gives each action an `id`.

Before:

```tsx
<ListItem
  label="Inbox"
  swipeActions={{trailing: [{label: 'Archive', onActivate: archive}]}}
  swipeBehavior="commit"
/>
```

After:

```tsx
import {createSwipe} from '@astryxdesign/core/Swipe';

const inboxSwipe = createSwipe({
  trailing: [
    {
      id: 'archive',
      label: 'Archive',
      onActivate: ({itemKey}) => archive(itemKey),
    },
  ],
  swipeBehavior: 'commit',
});

<ListItem label="Inbox" itemKey={message.id} swipe={inboxSwipe} />;
```

@vjeux
