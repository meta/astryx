---
'@astryxdesign/cli': patch
---

[fix] Icon sets: `integration check` now accepts a generated declaration file (`*.generated.d.ts`) whose long type arguments a formatter such as Prettier re-wrapped. Before, the re-wrapped line made the check report `icon_generated_types_mismatch` and fail. A changed declaration still fails the check. The experimental icon commands are unchanged.
@josephfarina
