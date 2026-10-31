---
'@astryxdesign/core': patch
---

[fix] Timer hardening pass (Layers 1–2 of the Component Hardening Protocol, #6483). No behavior defect found — the audit confirmed the tick pipeline, format ladder, cadence switch, and resource cleanup match the `spec:AST-037` contract. Two untested guards are now pinned: the wait for a distant future `startTime` is capped at the 32-bit `setTimeout` ceiling, and an unknown `format` value coerces to `elapsed`. The Default story now asserts in a real browser that the display advances on its own. (#6483)

@ManoharPaturi
