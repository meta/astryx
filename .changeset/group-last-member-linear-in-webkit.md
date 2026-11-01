---
'@astryxdesign/core': patch
---

[fix] ButtonGroup and InputGroup: the rule that rounds a group's last member no longer makes Safari (WebKit) slow down as any container on the page fills. Inserting thousands of children into one element was quadratic in WebKit, over a second at 10,000, even outside groups. Corners look exactly as before: only the last member, skipping trailing popovers, templates and dialogs, rounds its trailing corners.

@cixzhang
