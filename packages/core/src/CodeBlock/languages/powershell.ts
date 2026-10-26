// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file languages/powershell.ts
 * @input Shared grammar builders from ../grammar
 * @output The `powershell` language value for CodeBlock: PowerShell
 * @position Subpath entry: @astryxdesign/core/CodeBlock/languages/powershell
 */

import {HASH_COMMENT, cLike, defineCodeLanguage} from '../grammar';

/** PowerShell: `powershell`, `ps1`, `pwsh`. */
export const powershell = /* @__PURE__ */ defineCodeLanguage(
  {
    name: 'powershell',
    identifiers: ['powershell', 'ps1', 'pwsh'],
    fileExtensions: ['ps1', 'psm1', 'psd1'],
    fileNames: [],
  },
  () =>
    cLike(
      'begin break catch class continue data do dynamicparam else elseif end exit filter finally for foreach function if in param process return switch throw trap try until using while',
      [
        {type: 'comment', regex: /<#[\s\S]*?#>/},
        {type: 'variable', regex: /\$[\w:]+/},
        {type: 'function', regex: /\b[A-Z][a-z]+-[A-Z]\w*/},
        {type: 'operator', regex: /-[a-z]+\b/},
      ],
      [HASH_COMMENT],
    ),
);
