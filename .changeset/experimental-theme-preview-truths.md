---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: a preview picture's browser makes no network request of its own (no update, time, sync or metrics checks, no proxy, no host name resolved), on the Chrome and Playwright paths alike. A theme file that is not a regular file (a named pipe, a link to a device) is never read, so `show` cannot hang on it. `show` names the theme images the previews cannot show (loaded from the network, not found, not a regular file, or over the size a preview page carries), and an image too large for a preview is refused with its name and size instead of as a React failure. Extra words to `preview app`, `preview list` and `preview remove` get a command that works and the command's help. `preview app --theme` from a workspace root gives the `cd` to the app. A description longer than the words read is quoted as typed, and a refusal says it was cut. A `--template` typo names only pages this app can add now.

@josephfarina
