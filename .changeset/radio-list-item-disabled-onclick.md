---
'@astryxdesign/core': patch
---

[fix] A disabled `RadioListItem` no longer runs a caller's `onClick` (`spec:AST-085` FR2). Before, a radio in a group disabled with a `disabledMessage` stays focusable through `aria-disabled` rather than native `disabled`, so the browser did not silence it and the handler still ran on a click on the radio, on Space, and on an arrow key onto it. It still refused to select. An enabled radio is unchanged: its `onClick` still runs.

@parinith-web
