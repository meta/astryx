---
'@astryxdesign/core': patch
---

[docs] EmptyState now announces through the page's shared announcer regions, a visually hidden `role="status"` (polite) and `role="alert"` (assertive) pair that Astryx mounts once on `document.body`. In tests, a query such as `getByRole('status')` or `getByRole('alert')` can therefore match one of these regions rather than your component. Scope the query to your component with `within(container)`.

@cixzhang
