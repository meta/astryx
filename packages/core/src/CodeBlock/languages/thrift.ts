// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file languages/thrift.ts
 * @input Shared grammar builders from ../grammar
 * @output The `thrift` language value for CodeBlock: Thrift IDL: `thrift`
 * @position Subpath entry: @astryxdesign/core/CodeBlock/languages/thrift
 */

import {
  BLOCK_COMMENT,
  HASH_COMMENT,
  LINE_COMMENT,
  cLike,
  defineCodeLanguage,
} from '../grammar';

/** Thrift IDL: `thrift`. */
export const thrift = /* @__PURE__ */ defineCodeLanguage(
  {
    name: 'thrift',
    identifiers: ['thrift'],
    fileExtensions: ['thrift'],
    fileNames: [],
  },
  () =>
    cLike(
      'namespace include cpp_include typedef enum struct union exception service extends oneway void throws const required optional bool byte i8 i16 i32 i64 double string binary list set map true false',
      [],
      [BLOCK_COMMENT, LINE_COMMENT, HASH_COMMENT],
    ),
);
