---
'@astryxdesign/cli': patch
---

[fix] The order detail, work item detail and component documentation page templates read correctly when they are shared as a file that runs no script. Their first paint is the narrow layout at every width, instead of a desktop side rail that squeezed the page into a narrow column on a phone; once script runs, wide screens still get the side rail. On a narrow screen the order and work item details now follow the main column instead of opening in a full-screen dialog, and the component documentation's section links stay on top as links instead of a picker.

@josephfarina
