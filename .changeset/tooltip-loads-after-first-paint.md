---
'@astryxdesign/core': patch
---

[perf] Tooltip code now loads in the background after the page first paints, instead of with the page. A page whose components offer tooltips (Button, IconButton, Link, the form fields and others) loads up to about 17 KB less gzipped JavaScript before it shows. Tooltips look and behave as before once that load lands, usually well before anyone hovers. A hover or keyboard focus that is still on a trigger when the load lands shows its tooltip then. Until the load lands, a trigger carries no `aria-describedby` and no closed tooltip layer is in the page. If you use the `useTooltip` hook, its `describedBy` and `anchorId` are empty strings until the load lands. Write `aria-describedby={tooltip.describedBy || undefined}` so your trigger does not render an empty attribute before then. Tests that read a tooltip right after rendering should wait for it, for example with `findByRole('tooltip', {hidden: true})`.

@cixzhang
