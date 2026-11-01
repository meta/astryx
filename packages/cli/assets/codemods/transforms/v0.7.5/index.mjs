// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file next transform manifest
 *
 * Staged codemods for the next release. The Version Packages PR promotes
 * this file into the resolved version folder.
 */

import migrateCodeBlockTokenizerToLanguage, {
  meta as migrateCodeBlockTokenizerToLanguageMeta,
} from './migrate-codeblock-tokenizer-to-language.mjs';

export default [
  {
    name: 'migrate-codeblock-tokenizer-to-language',
    transform: migrateCodeBlockTokenizerToLanguage,
    meta: migrateCodeBlockTokenizerToLanguageMeta,
  },
];
