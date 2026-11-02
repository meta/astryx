# /internal/test-utils/src

Source code for shared testing utilities.

<!-- SYNC: When files in this directory change, update this document. -->

| File       | Role  | Purpose                                                                                                                                                             |
| ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | Entry | Re-exports testing utilities from @testing-library/react                                                                                                            |
| `setup.ts` | Setup | Vitest setup file; extends matchers with jest-dom, adds jsdom polyfills, and keeps the group last-member rule (`:nth-last-child(1 of …)`) out of jsdom's stylesheet |
