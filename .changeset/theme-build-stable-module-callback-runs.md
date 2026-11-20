---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build`: what a theme module leaves running no longer decides the command, and three source layouts build.

- A callback a theme module leaves running that calls `process.exit` after the module loaded is ignored with a warning; one that sets `process.exitCode` does not set the command's; one that throws is a warning, not a crash after the result.
- A family root may import the family's own stylesheet (`import './k.css'` for `--family-key k`), and a source its own stylesheet with a query (`import './p.css?inline'`): a first build from a clean checkout writes it.
- A project in a folder whose name holds `#`, `?` or `%20` builds a theme that imports a stylesheet.
- What a theme module changes for the whole process while it loads (the working folder, a built-in object such as `JSON` or `Object.prototype`) is put back when the load ends.
- `--out` naming a TypeScript declaration file (`p.css.d.ts`) is refused with the stylesheet name to give, instead of writing CSS into it.

@josephfarina
