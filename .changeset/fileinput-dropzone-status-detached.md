---
'@astryxdesign/core': minor
---

[breaking] A FileInput in dropzone mode no longer renders its status message `attached`. It defaults to `detached`, and an explicit `statusVariant="attached"` on a dropzone resolves to `detached`, because the tall dropzone surface cannot carry an overlapping message. Input mode keeps `attached` as its default, and `tooltip` works in both modes.

Migration: nothing is required. A dropzone's status message now sits below the dropzone with spacing instead of overlapping its bottom edge. To keep the message off the page until asked for, pass `statusVariant="tooltip"`. Remove `statusVariant="attached"` from dropzones; it has no effect there.

@cixzhang
