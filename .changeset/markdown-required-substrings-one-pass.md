---
'@astryxdesign/core': patch
---

[perf] Markdown text transforms that declare `requiredSubstrings` look for those substrings in one pass over the source. Before, each paragraph searched the rest of the document again, so long Markdown (such as a long streamed chat answer) rendered more slowly with each paragraph. Output is unchanged.

@cixzhang
