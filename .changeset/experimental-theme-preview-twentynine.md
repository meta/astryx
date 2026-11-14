---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview remove`: the check that keeps a page your code imports now reads the whole project (every source file outside installs, build output and dot folders), parses each file's imports, exports, `import()` and `require()` calls, template-string ones included, and also guards the route a file re-exports. A project too big to check is refused rather than half-checked. A route changed by hand is told to move out of the preview folder. `preview add --template overview|components|colors` adds just that page when it is missing, or says why not. Temp files a stopped preview command left are cleaned by the next one and by a full remove.

@josephfarina
