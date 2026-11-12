---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: the sixth pass of fixes.

- A theme lock is never taken from a command that still runs: not from one in a container on the same computer, and not from one that is only stopped. A command that lost its lock while stopped writes nothing more and undoes its change.
- A theme whose settings were deleted or damaged, or left by a stopped `new`, is made again by `new` with its name. Your own files stay, the damaged file is kept, and `undo` steps back to the earlier settings.
- `show` checks that React is installed before it writes anything, rebuilds a cut-short stylesheet, and names a picture cut to the window. Demo images open from disk. Leftover temp files are removed.
- Every editor refusal leads with a command that runs.

@josephfarina
