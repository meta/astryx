---
'@astryxdesign/cli': patch
---

[docs] The install page now says that registry calls use Astryx's own short retry and timeout, not npm's fetch-retry or fetch-timeout settings: one retry after a wait of 2 to 10 seconds, and at most 30 seconds per request.

@josephfarina
