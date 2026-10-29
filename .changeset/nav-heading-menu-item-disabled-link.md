---
'@astryxdesign/core': patch
---

[fix] A disabled `NavHeadingMenuItem` with `href` no longer navigates (`spec:AST-085` FR2). Before, it kept its link destination and only skipped `onClick`, so a click, a middle-click, or assistive-technology activation still followed the link. It now renders a plain `<a>` with no `href`, still reports `aria-disabled`, and does not use a custom `LinkProvider` component. The disabled link row now carries `tabIndex={-1}`: it stays focusable but is no longer a Tab stop (before, it was a page Tab stop only because it kept its `href`; `spec:AST-085` FR1). A link row that becomes disabled or enabled while focused keeps focus (`spec:AST-085` FR4). Apps need no code change; an enabled item is unchanged.

@parinith-web
