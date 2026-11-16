---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` no longer replaces a file it did not write at its default outputs beside the source. A file of your own named like an output (`brand.css` or `brand.js` beside `brand.ts`) used to be silently overwritten; now the build fails with `ERR_FILE_EXISTS`, names the file, and writes nothing. Outputs of earlier builds, from any release, are still replaced as before. To migrate a project that keeps its own file under an output's name, build to another place with `--out` (for example `--out dist/brand.css`), or move or rename your file. The `--out` refusal no longer suggests building beside the source, which could replace such a file.

@josephfarina
