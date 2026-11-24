---
'@astryxdesign/core': patch
---

[feat] `usePopover` takes `tabBehavior`. The default, `'contain'`, is the behavior so far: Tab and Shift+Tab cycle inside the open popover. With `tabBehavior: 'pageOrder'` the popover holds nothing: Tab moves through the page. Where the browser supports popover invokers, the popover's controls come after its trigger, or after an anchor that can take focus when it has no trigger. A tooltip or the keyboard hint on the trigger does not disturb that place: neither registers its trigger as a popover invoker any more. When another layer opened from the same trigger or anchor closes (a menu, a hover card), the popover's controls leave the Tab order until the popover opens again. Escape closes it only while focus is inside it, or on or inside its anchor or trigger, and it never carries `aria-modal`. Use it for a coachmark or a tour step, whose reader must reach the control it describes. `isModal` keeps its meaning: it sets `aria-modal` on a dialog popover, and Tab stays inside the popover whether it is `true` or `false`.

@nynexman4464
