---
'@astryxdesign/cli': patch
---

[fix] Icon sets: `integration check` now accepts a generated declaration file (`*.generated.d.ts`) that a formatter such as Prettier rewrote: re-wrapped long type arguments, other quotes, and no semicolons. Before, a re-wrapped line made the check report `icon_generated_types_mismatch`, so `integration check --strict` failed. A changed declaration still fails the check. Only the experimental icon commands and `integration check` on an icon set change.
@josephfarina
