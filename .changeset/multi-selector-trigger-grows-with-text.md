---
'@astryxdesign/core': patch
---

[fix] MultiSelector: the trigger now grows with a larger text size instead of holding a fixed height, so a one-line value stays inside it when a person sets a larger browser text size. In every shipped theme it keeps its size token exactly at the theme's text size, as before. A custom theme whose size token is too small for one line of text now gets a trigger tall enough to hold it, as Selector's is. Its content never sets its height: badges that wrap in a narrow field keep one row, as today. An input or secondary trigger inside an InputGroup still takes the group's row. In a theme whose label line height is above the 20px cap, the value text is now vertically centred, as Selector's is.

@cixzhang
