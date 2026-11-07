---
'@astryxdesign/core': patch
---

[perf] A page that mounts many `OverflowList`s lays out once for all of them instead of once per list. Lists that mount or change in one render now measure together after it, before the frame paints, so the first painted frame is the same. `useOverflow` results and `onOverflowChange` arrive one microtask after the render instead of inside it. A test that checks them right after a synchronous render awaits that microtask first, for example with `await act(async () => {})`.

@cixzhang
