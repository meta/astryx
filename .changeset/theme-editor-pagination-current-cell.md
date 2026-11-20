---
'@astryxdesign/cli': patch
---

[experimental] The theme editor reads a pagination's current page as its own cell. "Make the current page in pagination blue" writes `--on pagination-item --state selected`, kept apart from every other button, instead of a `current` state on every button, and `button` no longer lists `current` as a state.

@josephfarina
