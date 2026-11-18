---
'@astryxdesign/cli': patch
---

[fix] A page template's keyword now means one concept. When build chooses the start and its alternatives, a multi-word keyword counts only as the whole phrase (skipping stopwords and one-letter words inside it), so its single words no longer count for other templates. Core templates' keywords are migrated: lists of words are split into single keywords, terms that mean something different as a whole (such as "getting started" or "reading pane") stay phrases, and keywords that weren't true of their template are removed. The template-doc field reference says how to write keywords.

@josephfarina
