---
'@astryxdesign/core': minor
---

[breaking] A FileInput in dropzone mode resolves an explicit `statusVariant="attached"` to `detached`, because the tall dropzone surface cannot carry an overlapping message. A dropzone already defaults to `detached`; input mode keeps `attached` as its default, and `tooltip` works in both modes.

Migration: remove `statusVariant="attached"` from dropzones; it has no effect there, and the message sits below the dropzone with spacing. To keep the message off the page until asked for, pass `statusVariant="tooltip"`.

@cixzhang
