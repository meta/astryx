// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file languages/graphql.ts
 * @input Shared grammar builders from ../grammar
 * @output The `graphql` language value for CodeBlock: GraphQL: `graphql`, `gql`
 * @position Subpath entry: @astryxdesign/core/CodeBlock/languages/graphql
 */

import {HASH_COMMENT, cLike, defineCodeLanguage} from '../grammar';

/** GraphQL: `graphql`, `gql`. */
export const graphql = /* @__PURE__ */ defineCodeLanguage(
  {
    name: 'graphql',
    identifiers: ['graphql', 'gql'],
    fileExtensions: ['graphql', 'gql'],
    fileNames: [],
  },
  () =>
    cLike(
      'query mutation subscription fragment on type input enum interface union scalar schema extend directive implements repeatable true false null',
      [
        {type: 'variable', regex: /\$\w+/},
        {type: 'constant', regex: /@\w+/},
        {type: 'string', regex: /"""[\s\S]*?"""/},
      ],
      [HASH_COMMENT],
    ),
);
