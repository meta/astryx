---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] Hook docs for `useLinkComponent`, so `astryx hook useLinkComponent` and `astryx search` return it, and a `useLinkComponent — Article Cards` example block: custom Article cards render their title link with the component the hook resolves. Inside a LinkProvider wired to a client-side router the title navigates without a page load, `as="a"` gives a native anchor even inside the provider, and outside the provider the title falls back to the next provider up or a native anchor. Copy it with `astryx template useLinkComponentHookUsage <path>`.

@MannXo
