---
'@astryxdesign/core': patch
---

[fix] MultiSelector: the trigger now grows with a larger text size instead of holding a fixed height, so a person who sets a larger browser text size sees the whole value. At the theme's text size it keeps its size token exactly, as before. Inside an InputGroup it still takes the group's row.

@cixzhang
