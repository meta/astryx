---
'@astryxdesign/core': patch
---

[feat] Swipe actions on `Item` and `ListItem` come from one prop, `swipe`, whose value `createSwipe` makes, from `@astryxdesign/core/Swipe` or the package root: `swipe={createSwipe({leading, trailing, swipeBehavior})}`. The swipe's code comes with `createSwipe`, so a row given `swipe` is swipeable at its first paint, and an app that never imports it ships none of it. The `swipeActions` and `swipeBehavior` props and the `ItemSwipeAction`, `ItemSwipeActions`, `ItemSwipeActionVariant` and `ItemSwipeBehavior` types are deprecated (DEP-0017) and are removed in the next minor release. Until then they work as released, and when `swipe` is set too, `swipe` wins. `astryx upgrade` rewrites static uses, and the types become `SwipeAction`, `CreateSwipeOptions`, `SwipeActionVariant` and `SwipeBehavior`.

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

<ListItem
  label="Inbox"
  swipe={createSwipe({
    trailing: [{label: 'Archive', onActivate: archive}],
    swipeBehavior: 'commit',
  })}
/>;
```

@vjeux
