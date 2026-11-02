---
'@astryxdesign/core': patch
---

[fix] `HoverCard` and `Tooltip`: a controlled `isOpen={true}` (or `isDefaultOpen`) no longer strands the layer in the viewport corner when its trigger mounts with no layout box yet, for example inside a `Dialog` that has not called `showModal()` yet.

`Dialog` mounts its children before it opens (`isOpen` gates `showModal()`, not rendering), so a `HoverCard` or `Tooltip` inside one with a controlled `isOpen={true}` runs its show effect while the trigger sits in a still non-modal `<dialog>` and has no box. A trigger with no box is not a valid CSS anchor: the popover resolves to its fallback position in the viewport corner, and unlike a live layout change that resolution is not revisited once the trigger later gets a box.

`Layer`'s `show()` now opens immediately when the trigger already has a layout box (an empty one, such as a ContextMenu's cursor anchor, counts), so a menu or popover still opens in the same task as the press that asked for it. Only a trigger with no layout box (`display: none`, or inside a `<dialog>` that is not showing) waits: first for it to get a layout box and for its dialog to show, then for any running, finite animation on an ancestor to finish, so the layer anchors to the trigger's settled position and not to a mid-transition one. Paused animations and infinite ones are not waited on.

The box wait is driven by signals and polls nothing: a `ResizeObserver` for a trigger that gains a layout box, an `IntersectionObserver` for a purely `display: inline` trigger (such as the wrapper `<span>` of a text-only trigger), which a `ResizeObserver` never delivers an entry for, and the enclosing dialog's `open` attribute and `toggle` event. A dialog counts as showing when it is open or shown as a popover, so triggers inside a non-modal `Drawer` still open their layers. The wait has no time limit and ends when the trigger gets a box inside a showing dialog or the open is cancelled (a later `show()` or `hide()`, or unmount). If the trigger element is replaced while waiting, the wait restarts on the new one, and a trigger that unmounts for good stops observing. Without a layout engine to wait on (no `ResizeObserver` or no Web Animations API, as in jsdom) the layer opens immediately.

A transient `null` then same-element call on the trigger ref, as a combined ref utility makes when a handler changes identity, no longer removes and re-adds the element's `anchor-name`, which could also leave an open layer stranded in the corner.

@HelloOjasMutreja
