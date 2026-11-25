---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] `Tour` is now a Core component. It walks a person through a page one step at a time: you pass a `steps` array and the id of the active step, and Tour draws a callout beside each step's anchor, a ring on the anchor, and an optional backdrop. A step left out of the array does not exist, a step with no anchor shows in the center, `missingAnchorBehavior` decides what a missing anchor does, and a step's `showAction` can open a panel first. Without a backdrop the page stays usable; with `hasBackdrop` each step is modal. It replaces the Lab `Tour`, which is removed with `TourStep` and `useTour`: each `<TourStep>` becomes an entry of `steps` (`targetRef` is `anchorRef`, `heading` is `title`, its children are `body`), `isActive` becomes `activeId`, `onDismiss` becomes `onEnd`, and `isStepCountShown` becomes `hasStepCount`. The CLI ships a showcase and an example block for the Core Tour, and no longer lists the Lab one.

@nynexman4464
