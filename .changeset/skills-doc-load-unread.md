---
'@astryxdesign/cli': patch
---

[fix] When the docs catalog withdraws an integration's docs because one doc fails its checks (such as a flat topic that sets `aliases`), `init` and `upgrade --apply` keep that package's skill copies until the doc loads instead of removing them as leftovers, and when any of its docs does not load, its skills get one note saying so instead of a `replaces` fix.

@josephfarina
