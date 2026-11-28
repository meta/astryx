---
'@astryxdesign/core': patch
---

[perf] Tooltip code now loads in the background after the page first paints, instead of with the page. A page whose components offer tooltips (Button, IconButton, Link, the form fields and others) loads up to about 24 KB less gzipped JavaScript before it shows. Tooltips look and behave as before once that load lands, usually well before anyone hovers. A hover or keyboard focus that is still on a trigger when the load lands shows its tooltip then. Until the load lands, a trigger carries no `aria-describedby`. After it, a hidden copy of the tooltip text describes the trigger until the tooltip first shows, and then the tooltip itself does. A tooltip whose `isEnabled` is false loads nothing until it is enabled, so a field's disabled-reason tooltip adds no tooltip code to a page where it cannot show. If you use the `useTooltip` hook, its `describedBy` is an empty string until the load lands. Write `aria-describedby={tooltip.describedBy || undefined}` so your trigger does not render an empty attribute before then. Tests that read a tooltip's description right after rendering should wait for the load, for example with `await waitFor(() => expect(trigger).toHaveAccessibleDescription(text))`.

@cixzhang
