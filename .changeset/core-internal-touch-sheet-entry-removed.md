---
'@astryxdesign/core': patch
---

[chore] Internal: the undocumented `@astryxdesign/core/internal/touch-sheet` entry is removed. It re-exported the touch sheets' confirmation, search-drag dismissal and draft rules for the Lab prototypes of the Tokenizer and PowerSearch sheet presentations, which no longer exist; Core's sheets import the same modules by relative path. Internal entries are outside the public API and its compatibility promise. (#9790)

@imdreamrunner
