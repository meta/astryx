// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseMarkdownAst} from './parser';

type Json = {type: string; lang?: string | null; meta?: string; value?: string};

/** The first block's language, meta, and code. */
function code(markdown: string): {
  lang: string | null;
  meta: string | null;
  value: string;
} {
  const [block] = parseMarkdownAst(markdown).children as unknown as Json[];
  return {
    lang: block.lang ?? null,
    meta: block.meta ?? null,
    value: block.value ?? '',
  };
}

describe("a fence's info string (CommonMark 0.31 §4.5)", () => {
  it.each([
    ['~~~ js\nx\n~~~\n', {lang: 'js', meta: null, value: 'x'}],
    ['``` js\nx\n```\n', {lang: 'js', meta: null, value: 'x'}],
    [
      '~~~   python title="a.py"\nx\n~~~\n',
      {lang: 'python', meta: 'title="a.py"', value: 'x'},
    ],
    [
      '``` {.haskell .numberLines}\nx\n```\n',
      {lang: '{.haskell', meta: '.numberLines}', value: 'x'},
    ],
    [
      '~~~python title="a.py"\nx\n~~~\n',
      {lang: 'python', meta: 'title="a.py"', value: 'x'},
    ],
    ['~~~c++ \nx\n~~~\n', {lang: 'c++', meta: null, value: 'x'}],
    ['~~~\nx\n~~~\n', {lang: null, meta: null, value: 'x'}],
    ['~~~   \nx\n~~~\n', {lang: null, meta: null, value: 'x'}],
  ])(
    'reads the language of %j from its first word, after any spaces',
    (markdown, expected) => {
      expect(code(markdown)).toEqual(expected);
    },
  );
});
