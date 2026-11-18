// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Ambient declaration for `jscodeshift`, which ships no type declarations.
 * The AST surface is intentionally untyped; codemod transforms operate on it
 * dynamically. This keeps dynamic `import('jscodeshift')` from tripping TS7016
 * under strict checkJs.
 */
declare module 'jscodeshift' {
  interface JscodeshiftFactory {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (...args: any[]): any;
    withParser: (parser: string | {parse: (source: string) => unknown}) => any;
    [key: string]: any;
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }
  const jscodeshift: JscodeshiftFactory;
  export default jscodeshift;
}
