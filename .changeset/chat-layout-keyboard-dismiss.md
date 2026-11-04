---
'@astryxdesign/core': patch
---

[feat] ChatLayout: with a software keyboard up in a top-level page (not under `interactive-widget=resizes-content`), dragging the conversation down to the composer with a finger or a pen and lifting there now dismisses the keyboard, as in Messages; a release moving back up keeps it. Once the finger is over the composer, the composer and the frosted layer under it follow the finger down, and they spring back to rest after the lift; under Reduce Motion they stay still and the pressed overlay fades in over the composer instead. A mouse drag still selects text and moves focus as before. A web page cannot move the system keyboard, so the keyboard leaves on its own at the lift instead of following the finger. Drags that start in the composer never dismiss it, and dismissing moves focus nowhere. Drag-to-dismiss has no caller control. Typing with a keyboard is unchanged.

@vjeux
