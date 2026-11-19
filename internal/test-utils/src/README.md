# /internal/test-utils/src

Source code for shared testing utilities.

<!-- SYNC: When files in this directory change, update this document. -->

| File                   | Role  | Purpose                                                                                                                                                               |
| ---------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`             | Entry | Re-exports testing utilities from @testing-library/react                                                                                                              |
| `jsdomRefusedRules.ts` | Setup | The marker of the rule the test setup keeps out of jsdom's stylesheet, shared by `setup.ts` and `stylexInject.ts`                                                     |
| `setup.ts`             | Setup | Vitest setup file; extends matchers with jest-dom, adds jsdom polyfills, and keeps the group last-member rule (`:nth-last-child(1 of …)`) out of jsdom's stylesheet   |
| `stylexInject.ts`      | Setup | The StyleX runtime injection vitest.config.ts names: StyleX's own, plus each rule its 0.19.0 dev runtime drops because it keys the rule by an at-rule's prelude alone |
