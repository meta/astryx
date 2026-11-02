---
'@astryxdesign/core': patch
---

[fix] ButtonGroup and InputGroup: the rule that rounds a group's last member no longer slows down filling a container in WebKit (as measured), on any page, groups or not. In WebKit, inserting 10,000 children into one element took about 1.15 s with the old rule on the page and about 10 ms with the new one. Corners look exactly as before: only the last member, skipping trailing popovers, templates and dialogs, rounds its trailing corners.

@cixzhang
