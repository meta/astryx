---
'@astryxdesign/core': patch
---

[fix] A Popover with a trigger child no longer attaches its trigger again after every render. When the trigger's text changed between renders, that loop could stop the page with "Maximum update depth exceeded". The trigger now attaches again only when the popover's open state or ids change.

@cixzhang
