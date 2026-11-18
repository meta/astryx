---
'@astryxdesign/cli': patch
---

[fix] The technical documentation page template reads correctly when it is shared as a file that runs no script. Its first paint is one column with the section links on top at every width, instead of a desktop side rail that squeezed the article into a narrow column on a phone; once script runs, wide screens still get the side rail. Copy buttons appear only once the page runs, so a static copy shows no buttons that do nothing. On a phone the section links stay on top as links instead of a picker.

@josephfarina
