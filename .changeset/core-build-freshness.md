---
'@astryxdesign/cli': patch
---

[chore] The CLI's test setup rebuilds Core when its build is older than Core's sources or translations, before any test starts, so a reused checkout no longer tests the CLI against an old Core build; a test waiting on another's build reads it only once that build is finished, one checkout's build no longer holds up another's tests, and a run that cannot rebuild a stale Core while an earlier run in the checkout uses it stops with an error naming that run.

@vjeux
