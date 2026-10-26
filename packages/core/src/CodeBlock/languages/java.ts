// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file languages/java.ts
 * @input Shared grammar builders from ../grammar
 * @output The `java` language value for CodeBlock: Java: `java`
 * @position Subpath entry: @astryxdesign/core/CodeBlock/languages/java
 */

import {cLike, defineCodeLanguage} from '../grammar';

/** Java: `java`. */
export const java = /* @__PURE__ */ defineCodeLanguage(
  {
    name: 'java',
    identifiers: ['java'],
    fileExtensions: ['java'],
    fileNames: [],
  },
  () =>
    cLike(
      'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static super switch synchronized this throw throws transient try var void volatile while record sealed permits yield true false null',
      [
        {type: 'constant', regex: /@\w+/},
        {type: 'string', regex: /"""[\s\S]*?"""/},
      ],
    ),
);
