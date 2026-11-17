---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` no longer replaces a file it did not write at its default outputs beside the source. A file of your own named like an output (`brand.css` or `brand.js` beside `brand.ts`) used to be silently overwritten; now the build fails with `ERR_FILE_EXISTS`, names the file, and writes nothing. At the default outputs, a file an earlier build wrote is still replaced, an output of the CLI before it was named Astryx included. At a path `--out` names nothing changes: only a file with the current build header is replaced, as before. Beside the source, an output another theme source built there is replaced with a warning naming both sources, as at `--out`. To migrate a project that keeps its own file under an output's name, build to another place with `--out` (for example `--out dist/brand.css`), or move or rename your file. The `--out` refusal no longer suggests building beside the source, which could replace such a file.

@josephfarina
