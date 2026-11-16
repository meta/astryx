---
'@astryxdesign/cli': patch
---

[fix] The incident console page template works on a phone and its buttons act. On a narrow screen its header controls wrap onto their own rows, and choosing an incident opens its details in a bottom sheet instead of doing nothing. The inspector's next-step button ("Mark mitigated", "Resolve", "Reopen") moves the incident to its next status, and "Escalate" and "Declare incident" confirm with a demo toast that marks where to connect the real action. Rows show each incident's start date and time instead of a relative time that grew stale. The template stays unready for now.

@josephfarina
