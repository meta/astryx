---
'@astryxdesign/cli': patch
---

[feat] `astryx docs --list` lists every docs topic: the same list that `astryx docs` prints with no topic, in text and as `docs.list` with `--json`. It used to fail with `unknown option '--list'`, while `component --list`, `template --list` and `hook --list` each list their catalog. Every other docs flag reads with `--list` as it reads with no topic; a topic or section beside `--list` is refused with `ERR_INVALID_ARGUMENT`. `docs()` takes the same `list` option.

@josephfarina
