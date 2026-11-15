---
'@astryxdesign/cli': patch
---

[docs] The install page now says that registry calls use Astryx's own short retry and timeout, not npm's fetch-retry or fetch-timeout settings: one retry after a 2-second wait, and at most 30 seconds per request.

@josephfarina
