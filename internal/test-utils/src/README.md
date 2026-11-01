# /internal/test-utils/src

Source code for shared testing utilities.

<!-- SYNC: When files in this directory change, update this document. -->

| File              | Role  | Purpose                                                                                                                                        |
| ----------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`        | Entry | Re-exports testing utilities from @testing-library/react                                                                                       |
| `setup.ts`        | Setup | Vitest setup file; extends matchers with jest-dom                                                                                              |
| `stylexInject.ts` | Setup | The StyleX runtime injection vitest.config.ts names: StyleX's own, plus each rule its 0.19.0 dev runtime drops under a multi-condition prelude |
