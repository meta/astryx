---
'@astryxdesign/core': patch
---

[perf] `OverflowList`s that mount or change in one render now measure together after it, before the frame paints. When other components write to the page in the same render, each list used to read its size after those writes and force its own layout; now all lists read their sizes first and the page lays out once for them. The first painted frame is the same. `useOverflow` results and `onOverflowChange` arrive one microtask after the render instead of inside it. A test that checks them right after a synchronous render awaits that microtask first, for example with `await act(async () => {})`. With fake timers that also fake `queueMicrotask`, as Jest's modern fake timers do by default, flush the faked microtasks too, for example with `jest.runAllTicks()` or `vi.runAllTicks()`.

@cixzhang
