---
'@astryxdesign/cli': patch
---

[fix] Page templates now have no horizontal overflow in a 390 px wide window. In the service-health, data, funnel-and-cohort and program-status dashboards and the kanban board, the header controls now wrap onto a second row instead of widening the page past the screen edge, and on the data dashboard a section heading's hint is no longer squeezed into a narrow column beside the heading. Desktop layouts are unchanged. A check renders every ready page template in a 390 px window to keep it so; five templates whose phone layout appears only after their scripts run are listed by name until they fit.

@josephfarina
