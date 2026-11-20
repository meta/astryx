---
'@astryxdesign/cli': patch
---

[fix] Page templates now have no horizontal overflow on a 390 px phone, with touch or a mouse. In the service-health, data, funnel-and-cohort and program-status dashboards and the kanban board, the header controls now wrap onto a second row instead of widening the page past the screen edge, and on the data dashboard a section heading's hint is no longer squeezed into a narrow column beside the heading. Desktop layouts are unchanged. A check builds every ready page template into an app and runs it in a 390 px phone emulation, with touch and with a mouse, so a template that widens the page past a phone's screen fails before release.

@josephfarina
