---
'@astryxdesign/core': patch
---

[fix] A Text cut short by `maxLines` is now a tab stop while it is truncated, so keyboard users can open its full-text tooltip (Text FR4). Default before: a truncated Text took no focus. Default now: it renders `tabindex="0"` while truncated with its tooltip on. A Text inside a link, button, menu item, clickable card or other control stays out of the tab order and leaves focus to that control. To restore the old default for one Text, pass `tabIndex={-1}`; `hasTruncateTooltip={false}` removes both the tooltip and the tab stop.

@cixzhang
