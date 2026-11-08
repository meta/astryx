// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Ambient module declaration for `*.doc.mjs` imports.
 *
 * Package tests import `{Name}.doc.mjs` files directly to assert that their
 * documented metadata stays in sync with what the component renders (see the
 * theme-target test in RichTextEditor.test.tsx). Without this declaration,
 * TypeScript has no way to type a `.mjs` import and the package typecheck
 * fails with TS7016 ("Could not find a declaration file for module").
 * Mirrors packages/core/src/doc-mjs.d.ts, which this package cannot see.
 */

declare module '*.doc.mjs' {
  import type {
    ComponentDoc,
    ComponentTranslationDoc,
  } from '@astryxdesign/cli/authoring';

  export const docs: ComponentDoc;
  export const docsZh: ComponentDoc;
  export const docsDense: ComponentTranslationDoc;
}
