// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Ambient module declaration for Vite's `?raw` imports.
 *
 * numberParser.docblock.test.ts reads its own subject's source as text, to
 * check the prose in it against the parser's behaviour. Vite serves that with
 * the `?raw` query; without this declaration TypeScript fails with TS2307.
 */

declare module '*?raw' {
  const content: string;
  export default content;
}
