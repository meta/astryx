// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the declaration boundary scanner.
 *
 * Every "keeps" case is valid CSS a browser reads as one declaration; every
 * "rejects" case would end the declaration or rule early, swallow what follows
 * it, or be discarded by the browser as a bad token.
 */

import {describe, it, expect} from 'vitest';
import {
  checkDeclarationName,
  checkDeclarationValue,
} from './declarationBoundary';

describe('checkDeclarationValue keeps valid CSS inside one declaration', () => {
  it.each([
    ['plain color', '#FF00FF'],
    ['color function', 'color-mix(in oklch, #FF00FF 80%, white)'],
    ['gradient', 'linear-gradient(135deg, #FF00FF 0%, #00FFFF 100%)'],
    ['calc', 'calc(100% - 24px)'],
    ['light-dark', 'light-dark(#fff, #111)'],
    ['font stack', "'Inter Var', ui-sans-serif, system-ui"],
    ['important flag', 'red !important'],
    [
      'data URI, semicolon inside url()',
      'url(data:image/png;base64,iVBORw0KGgo=)',
    ],
    ['uppercase URL()', 'URL(data:image/svg+xml;base64,PHN2Zz4=)'],
    ['uppercase URL with an inert brace', 'URL(data:text/plain,a{b)'],
    ['mixed-case Url() with spaces', 'Url( data:image/png;base64,iVBORw0= )'],
    ['quoted url with semicolon', 'url("data:image/svg+xml;utf8,<svg/>")'],
    ['quoted url with a quoted brace', "url('x.png?a={1;2}')"],
    ['url nested in image-set', 'image-set(url(a;b.png) 1x, url(c;d.png) 2x)'],
    ['escaped space in identifier', 'Gill\\ Sans, serif'],
    ['escaped semicolon in identifier', 'a\\;b'],
    ['hex escape', '\\31 23'],
    ['escaped quote inside a string', '"a\\" ; b"'],
    ['semicolon inside a double-quoted string', '"a;b"'],
    ['semicolon inside a single-quoted string', "'a;b'"],
    ['braces inside a string', '"} body { color: red }"'],
    ['closed comment', '/* brand */ red'],
    ['closed comment with a semicolon inside', 'red /* ; } */'],
    ['comment-like text inside a string', '"/* not a comment"'],
    ['balanced brackets in a grid line name', '[full-start] 1fr [full-end]'],
    ['semicolon nested in parentheses', 'var(--x, a;b)'],
    ['brace nested in parentheses', 'var(--x, {a})'],
    ['backslash before a newline is a delim', 'a\\\nb'],
    ['whitespace including tab and newline', 'a\t\nb'],
    ['CRLF string continuation', '"a\\\r\nb"'],
    ['CRLF after a hex escape in a string', '"\\61\r\nb"'],
    ['escaped url identifier', 'u\\72l(data:image/png;base64,a)'],
    ['null is preprocessed by CSS', 'red\u0000'],
    ['control character inside a string', '"a\u0001b"'],
    ['control character inside a closed comment', 'red /* \u0001 ; } */'],
    ['empty value', ''],
  ])('keeps %s', (_label, value) => {
    expect(checkDeclarationValue(value)).toBeNull();
  });
});

describe('checkDeclarationValue rejects true declaration and rule breaks', () => {
  it.each([
    ['top-level semicolon', 'red; background: url(x)', ';'],
    ['top-level closing brace', 'red } body { color: blue', '}'],
    ['top-level opening brace', 'red { color: blue }', '{'],
    ['escaped quote is not a string opener', '\\"; background: red; "', ';'],
    ['unbalanced closing paren', 'red) ; body { color: blue', ')'],
    ['unbalanced closing bracket', 'red] ; x', ']'],
    ['mismatched closer', 'calc(1] ; x)', ']'],
    ['unclosed paren', 'calc(100% - 24px', '('],
    ['unclosed bracket', '[full-start', '['],
    ['unclosed string', '"open', 'string'],
    ['unclosed comment', 'red /* comment', 'comment'],
    ['unclosed url', 'url(x.png', 'url('],
    ['trailing backslash', 'red\\', 'backslash'],
    ['newline inside a string (bad string)', '"a\nb"', 'bad string'],
    ['whitespace inside an unquoted url (bad url)', 'url(a b)', 'bad url'],
    ['uppercase bad url', 'URL(a b)', 'bad url'],
    ['quote inside an unquoted url (bad url)', 'url(a"b)', 'bad url'],
    ['paren inside an unquoted url (bad url)', 'url(a(b)', 'bad url'],
    [
      'stray backslash inside an unquoted url (bad url)',
      'url(a\\\nb)',
      'bad url',
    ],
    ['control character inside an unquoted url', 'url(a\u0001b)', 'bad url'],
  ])('rejects %s', (_label, value, fragment) => {
    const reason = checkDeclarationValue(value);
    expect(reason).not.toBeNull();
    expect(reason).toContain(fragment);
  });
});

describe('checkDeclarationName', () => {
  it.each([
    'color',
    'background-image',
    '-webkit-line-clamp',
    '-moz-osx-font-smoothing',
    '--brand-accent',
    '--_internal',
    '--',
    '--1',
    '_private',
    'caf\u00e9',
    'a\\:b',
  ])('keeps %s', name => {
    expect(checkDeclarationName(name)).toBeNull();
  });

  it.each([
    '',
    '1px',
    '-1',
    'color: red',
    '--x:red} body{color:blue',
    'color;',
    'a b',
    'a\\',
    'background{',
  ])('rejects %j', name => {
    expect(checkDeclarationName(name)).not.toBeNull();
  });
});
