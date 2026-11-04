---
'@astryxdesign/core': patch
---

[fix] When an `OverflowList` (or a `useOverflow` host) resizes, it now shows the new visible set in the same frame. Before, the resize rendered after the frame painted, so one frame showed the old set at the new width: items spilled past the edge as the box shrank, or stayed collapsed as it grew. A resize now measures again in a microtask before paint, every list that one resize reports renders together, and a resize that changes nothing renders nothing. A resize whose new set can change the list's own height (a taller indicator appearing, or a multi-row list filling a different number of rows) still renders one frame later, as before, because rendering it before paint would make the browser report a ResizeObserver loop error. A resize that folds the list before paint can make Chromium report "ResizeObserver loop completed with undelivered notifications" once in that frame when another observer watches an outer element (Storybook's preview observes `<body>`); no notification is lost, and an error monitor should ignore this message.

Tests: a resize the observer reports now applies in a microtask, still before paint. A test that calls a mocked `ResizeObserver` callback and asserts synchronously right after it should first await a microtask, for example by wrapping the call in `await act(async () => { … })` or awaiting `Promise.resolve()`.

@cixzhang
