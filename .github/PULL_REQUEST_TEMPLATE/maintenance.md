<!-- Use this template for CI, tests, tooling, refactors, dependencies, or repository maintenance with no intended product behavior change. -->

## Maintainer impact

<!-- What operational or engineering problem occurs, for whom, and under what conditions? -->

## Intended invariant

<!-- Link current tooling/architecture authority or state the maintained behavior that must remain unchanged. -->

## Change

<!-- Explain the smallest mechanism change and why it belongs in maintenance rather than product behavior. -->

## Evidence

- Failure before the change:
- Success after the change:
- Product/runtime behavior verified unchanged:
- CI impact (for a change to workflows, actions or CI scripts): <!-- runner class of each changed job, job-minutes per update and runner-pool usage before and after, time to green; the PR report's CI impact section measures them -->

## Scope

- [ ] No intended public API, product behavior, visual direction, or policy change.
- [ ] Product changes discovered during the work were removed or split.
- [ ] Public text and artifacts contain no internal Meta context.

## Testing

<!-- Commands, failure injection, CI dry run, generated output, or performance evidence. -->
