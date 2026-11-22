---
'@astryxdesign/core': patch
---

[fix] Stepper: in a compact horizontal Stepper, the current step's description below the track now carries the `step-description` theming target with `progress` and `status`. A theme rule for `step-description` used to miss that text, so a theme that styles both `step-label` and `step-description` painted the summary's label but not its description.

@oyobbeb
