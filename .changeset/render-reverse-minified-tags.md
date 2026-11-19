---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render --reverse` finds the embedded source in a file whose script tag a minifier or another tool rewrote: an unquoted `type` (`<script type=application/x-astryx-source>`), or an attribute before `type`. Such a file used to come back as a page rebuilt from its markup (text and layout only) instead of the exact source.

@josephfarina
