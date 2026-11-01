// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file languages/dockerfile.ts
 * @input Shared grammar builders from ../grammar
 * @output The `dockerfile` language value for CodeBlock: Dockerfile: `dockerfile`, `docker`
 * @position Subpath entry: @astryxdesign/core/CodeBlock/languages/dockerfile
 */

import {
  DOUBLE_QUOTED,
  HASH_COMMENT,
  NUMBER,
  SINGLE_QUOTED,
  defineCodeLanguage,
} from '../grammar';

/** Dockerfile: `dockerfile`, `docker`. */
export const dockerfile = /* @__PURE__ */ defineCodeLanguage(
  {
    name: 'dockerfile',
    identifiers: ['dockerfile', 'docker'],
    fileExtensions: ['dockerfile'],
    fileNames: ['Dockerfile', 'Containerfile'],
  },
  () => ({
    defaultType: 'variable',
    patterns: [
      {type: 'comment', regex: HASH_COMMENT},
      {
        type: 'keyword',
        regex:
          /^[ \t]*(?:FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)\b/im,
      },
      {type: 'keyword', regex: /\bAS\b/},
      {type: 'string', regex: DOUBLE_QUOTED},
      {type: 'string', regex: SINGLE_QUOTED},
      {type: 'variable', regex: /\$\{?\w+\}?/},
      {type: 'number', regex: NUMBER},
      {type: 'operator', regex: /[&|\\=]+/},
    ],
  }),
);
