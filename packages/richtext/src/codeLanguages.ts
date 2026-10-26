// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file codeLanguages.ts
 * @input CodeLanguage values from @astryxdesign/core/CodeBlock
 * @output listedLanguage, which finds the listed value a fence word names, and
 *   sameLanguages, which compares two lists entry by entry
 * @position Shared by CodeSyntaxPlugin and CodeBlockHeaderPlugin, so RichText
 *   resolves a fence as Markdown does (component:Markdown FR30)
 */

import type {CodeLanguage} from '@astryxdesign/core/CodeBlock';

/** The listed value whose identifiers include `word`; a later entry wins. */
export function listedLanguage(
  languages: ReadonlyArray<CodeLanguage> | undefined,
  word: string,
): CodeLanguage | undefined {
  if (languages == null) {
    return undefined;
  }
  for (let i = languages.length - 1; i >= 0; i--) {
    if (languages[i].identifiers.includes(word)) {
      return languages[i];
    }
  }
  return undefined;
}

/** Whether two lists name the same values in the same order. */
export function sameLanguages(
  a: ReadonlyArray<CodeLanguage> | undefined,
  b: ReadonlyArray<CodeLanguage> | undefined,
): boolean {
  if (a === b) {
    return true;
  }
  if (a == null || b == null || a.length !== b.length) {
    return false;
  }
  return a.every((language, i) => language === b[i]);
}
