---
'@astryxdesign/cli': patch
---

[feat] `astryx template <name> <path>` writes a scratch copy to an absolute path in the system temp folder (`os.tmpdir()`, or `/tmp` on a POSIX system), such as `/tmp/dashboard`, instead of refusing it. The receipt names the folder by its whole path (`data.outputDir` in `--json`), and the checks of a write in the project apply: no link carries the copy out of the temp folder, and an existing file is replaced only with `--overwrite`. A temp folder that is a disk's root or holds the home folder is not used. Any other path outside the project is still refused with `ERR_PATH_TRAVERSAL`.

@josephfarina
