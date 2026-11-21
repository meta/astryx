---
'@astryxdesign/cli': patch
---

[docs] "Author a theme" says which parts are drawn as a Button, so a `button` entry reaches them too (an input's clear button, a calendar's month arrows, a code block's copy button, a timestamp's copy button, a chat's send button, a pager's buttons, a toast's close button, a banner's close button, a toggle button), and how to keep one out: an entry of its own for the same property, which wins over the component it sits on, except that an `!important` value in the component's entry still beats an `!important` value in the part's.

@josephfarina
