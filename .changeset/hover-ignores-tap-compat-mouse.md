---
'@astryxdesign/core': patch
---

On a phone or tablet with no mouse, a tap no longer opens a HoverCard or Tooltip whose trigger the tap leaves under the finger, such as a hint that a sheet opens beneath it. On a device that also has a mouse or trackpad, the same holds once any Core component on the page has seen a pointer press. A mouse or pen still hovers, also right after a tap, and focus that script moves to a trigger still opens it. `useTouchTrigger().isTouchInteraction()` also answers true for the focus such a tap gives a trigger that moved under the finger.
