---
'@astryxdesign/core': patch
---

[feat] `CheckboxList` takes `isRequired`. The group label shows the required indicator by the same rules as every input field. While no box is checked, the first box that is neither disabled nor read-only carries native `required`, so the browser blocks submit and moves focus to it with its own message. Once any box is checked, the form submits. A disabled or read-only group requires nothing. Show your own error text through `status`.

@cixzhang
