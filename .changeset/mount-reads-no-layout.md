---
'@astryxdesign/core': patch
---

[perf] `useScrollableArea` and `useScrollOverflow` take their first measurement at the browser's first resize notification after layout, so a `Table` without plugins, a `TabList` and a `SegmentedControl` read no layout or computed style in the commit that mounts them. A `Table` with column resizing, sticky columns or windowing still measures as it mounts. `useScrollableArea` (Table, ScrollableArea, CodeBlock, Tokenizer and BottomSheet) also no longer reads `document.fonts.ready`, which updates style and layout in Chromium. TabList reveals its selected tab at that notification, before the frame paints. SegmentedControl attaches its selection animators at the first selection change or press. `useScrollOverflow` (TabList and Carousel) commits that first measurement before the frame paints, so the edge fades and scroll arrows show from the first frame, at the offset TabList's reveal leaves. Carousel's scroll buttons take that first state without their fade. With `useScrollableArea`, the scroll state, tab stop and edge fade of an area that overflows as it mounts arrive one frame later. A test that stubs `ResizeObserver` delivers that notification, and awaits a microtask for `useScrollOverflow`, before it checks them; where no `ResizeObserver` exists, the first measurement happens at once, as before.

@Sufiyan-MSA
