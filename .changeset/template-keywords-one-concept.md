---
'@astryxdesign/cli': patch
---

[fix] A page template's keyword now means one concept. Build and search match a multi-word keyword only as the whole phrase, so its single words no longer count for other templates. Core templates' keywords are migrated: lists of words are split into single keywords, terms that mean something different as a whole (such as "getting started" or "reading pane") stay phrases, and keywords that weren't true of their template are removed. The template-doc guide says how to write keywords.

@josephfarina
