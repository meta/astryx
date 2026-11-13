---
'@astryxdesign/core': patch
---

[feat] Pagination: page links. Pass `getPageHref` and the page number, previous, next, first and last controls render as real links to each page's URL, so a page opens in a new tab, its address can be copied, and it works before scripts load. `getPageHref(page, pageSize)` returns the URL in the shape your app uses: a query parameter, a path segment, an offset or a cursor. `as` sets the link component, as on Button, and `LinkProvider` applies too. `onChange` is optional when `getPageHref` is set and still runs for each page change; when a link was activated it receives the click event as a second argument, and the link navigates by itself. The dots, the page box and the page-size selector are not links: navigate for them in `onChange` and `onPageSizeChange`. A Pagination without `getPageHref` is unchanged.
@nynexman4464
