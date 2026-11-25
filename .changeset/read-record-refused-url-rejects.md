---
'@astryxdesign/cli': patch
---

[fix] Inside a recorded run, `fs.promises.readFile` given a URL that names no local file (a non-`file:` scheme, or a `file:` URL with an encoded `/`) now returns a rejected promise, as it does outside a run, instead of throwing at the call.

@cixzhang
