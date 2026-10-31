---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feature] `createPanGesture(element, {axis?, onPan})` and `usePanGesture(ref, {axis?, onPan})` report a drag on an element as values: `onPan` gets `{state, translation, velocity}` as the drag begins, changes, ends at the release, or is cancelled, and a finger, a mouse and a pen all drive it. `axis` limits the drag to `'x'` or `'y'`; a drag along the other axis is not reported. `translation` counts from where the drag began, so an element that follows it does not jump, and `velocity` at `ended` is the release velocity in pixels per second. The drag claims its touch at UIKit's 10 pt and leaves presses and long presses alone. `destroy()` removes every listener; the hook creates one pan for the element behind `ref` and destroys it at unmount.

@vjeux
