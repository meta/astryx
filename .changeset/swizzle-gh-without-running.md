---
'@astryxdesign/cli': patch
---

[fix] `astryx swizzle` no longer runs `gh auth status` before it reports: the ready `gh issue create` line appears when `gh` is on your PATH, found without running it, so a copy never waits on a process start or on GitHub. The line now also appears when `gh` is installed but not logged in; running it, gh asks you to log in.

@vjeux
