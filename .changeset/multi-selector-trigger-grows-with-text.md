---
'@astryxdesign/core': patch
---

[fix] MultiSelector: the trigger now grows with a larger text size instead of holding a fixed height, so a one-line value stays inside it when a person sets a larger browser text size. It takes the same row height as the other text fields. At the theme's text size it keeps its size token exactly, as before, and its content never sets its height: badges that wrap in a narrow field keep one row, as today. Inside an InputGroup it still takes the group's row. In a theme whose label line height is above the 20px cap, the value text is now vertically centred, as Selector's is.

@cixzhang
