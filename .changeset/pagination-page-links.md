---
'@astryxdesign/core': patch
---

[feat] Pagination: page links. Pass `getPageHref` and the page number, previous, next, first and last controls render as real links to each page's URL, so a page opens in a new tab, its address can be copied, and it works before scripts load. `getPageHref(page, pageSize)` returns the URL in the shape your app uses: a query parameter, a path segment, an offset or a cursor. `as` sets the link component, as on Button, and `LinkProvider` applies too. `onChange` still runs when a link is activated: use it for state or analytics, and do not navigate in it, because the link navigates. The dots, the page box and the page-size selector are not links and work as before. A control that stops being a link while it holds focus, at the first or last page or while the pagination is disabled, keeps that focus. A Pagination without `getPageHref` is unchanged.
@nynexman4464
