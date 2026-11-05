---
'@astryxdesign/cli': patch
---

[chore] The CLI's test setup rebuilds Core when its build is older than Core's sources or translations. It does so before any test starts, so a reused checkout no longer tests the CLI against an old Core build. A test waiting on another's build reads it only once that build is finished. One checkout's build no longer holds up another's tests. A run that cannot rebuild a stale Core, while an earlier run in the checkout uses it, stops with an error naming that run.

@vjeux
