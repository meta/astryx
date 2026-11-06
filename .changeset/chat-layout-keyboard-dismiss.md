---
'@astryxdesign/core': patch
---

[feat] ChatLayout: with a software keyboard up in a top-level page (not under `interactive-widget=resizes-content`), dragging the conversation down to the composer with a finger or a pen now dismisses the keyboard as the finger reaches the composer, as in Messages. The composer gives one small spring bounce, never faster than the finger, and the scroll-to-bottom button moves with it; under Reduce Motion nothing moves. A drag down that starts on the composer dismisses the keyboard too, unless it began as a long press that moves the caret. While the keyboard is up, a one-finger drag on the composer never scrolls the conversation under it, and a part of the composer that scrolls on its own, such as a long draft or a strip of attachments, keeps its scroll. Two fingers still pinch-zoom the page. A mouse drag still selects text and moves focus as before. Dismissing moves focus nowhere, and drag-to-dismiss has no caller control. Typing with a keyboard is unchanged.

@vjeux
