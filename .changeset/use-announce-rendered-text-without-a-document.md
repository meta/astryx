---
'@astryxdesign/core': patch
---

[fix] Components that announce their rendered text (such as Selector, Typeahead, CommandPalette, ChatComposer, Toast and Spinner) render again where there is no `document`, such as react-test-renderer or another non-DOM client renderer. `useAnnounceRenderedText` read `document.readyState` while rendering; a render with no document now counts as part of the page's first load.

@light-merlin-dark
