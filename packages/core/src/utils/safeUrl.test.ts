// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {isSafeDestination, isSafeUrl, sanitizeUrl} from './safeUrl';

// Expectations come from the navigation contract, not another policy helper.
const accepted = [
  'https://example.com/a?b=c#d',
  'http://example.com',
  '//example.com/protocol-relative',
  '/relative/path',
  'relative/path',
  '#fragment',
  'mailto:a@example.com',
  'tel:+1234567890',
  'custom:open/document',
  'data:image/png;base64,iVBORw0KGgo=',
  'data:text/plain,download',
  'data: text/plain,download',
  'mailto: a@example.com',
];
const rejected = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  '  javascript:alert(1)',
  'vbscript:MsgBox(1)',
  'data:text/html,<script>alert(1)</script>',
  'DATA:TEXT/HTML;base64,PHNjcmlwdD4=',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  '\x00javascript:alert(1)',
  'java\x7fscript:alert(1)',
  // A data URL's media type ignores the spaces before it.
  'data: text/html,<script>alert(1)</script>',
  'data:   text/html,<script>alert(1)</script>',
  'DATA: TEXT/HTML;base64,PHNjcmlwdD4=',
  '  data: text/html,x',
  'data:\t text/html,x',
  'data: \ttext/html,x',
  'data:\x00 text/html,x',
  'data: \x7ftext/html,x',
  'javascript: alert(1)',
  'vbscript: MsgBox(1)',
];

describe('navigation strings', () => {
  it.each(accepted)('accepts %s', url => {
    expect(isSafeUrl(url)).toBe(true);
    expect(isSafeDestination(url)).toBe(true);
    expect(sanitizeUrl(url)).toBe(url);
  });
  it.each(rejected)('rejects %s', url => {
    expect(isSafeUrl(url)).toBe(false);
    expect(isSafeDestination(url)).toBe(false);
    expect(sanitizeUrl(url)).toBeNull();
  });
  it('normalizes accepted strings only when requested', () => {
    expect(sanitizeUrl('  /docs\n')).toBe('/docs');
    expect(sanitizeUrl('/do\x00cs')).toBe('/docs');
  });
});

describe('structured destinations', () => {
  it.each([
    {pathname: '/docs', search: '?q=1', hash: '#a'},
    {href: 'https://example.com'},
    {protocol: 'https:', hostname: 'example.com', pathname: '/docs'},
    {protocol: 'custom', pathname: 'document'},
    {protocol: 'mailto:', pathname: 'a@example.com'},
    {protocol: 'data:', pathname: 'image/png;base64,aA=='},
    {search: '?page=2'},
    {hash: '#section'},
    {},
    new URL('https://example.com/docs'),
    undefined,
    null,
  ])('accepts supported destination %j', destination => {
    expect(isSafeDestination(destination)).toBe(true);
  });
  it.each([
    {pathname: 'javascript:alert(1)'},
    {pathname: 'java\x00script:alert(1)'},
    {href: 'vbscript:MsgBox(1)'},
    {pathname: '/ok', href: 'javascript:1'},
    {protocol: 'javascript:', pathname: 'alert(1)'},
    {protocol: 'javascript', pathname: 'alert(1)'},
    {protocol: ' JaVa\tsCrIpT ', pathname: 'alert(1)'},
    {protocol: 'vbscript', pathname: 'MsgBox(1)'},
    {protocol: 'data:', pathname: 'text/html,<b>x</b>'},
    {protocol: 'data', pathname: 'TEXT/HTML;base64,PGI+eDwvYj4='},
    {protocol: 'data:', host: 'text/', pathname: 'html,<b>x</b>'},
    {protocol: 'data:', hostname: 'text/html,<b>x</b>'},
    {href: '/safe', protocol: 'javascript:'},
    new URL('javascript:alert(1)'),
    {pathname: 42},
    {protocol: {toString: (): string => 'javascript:'}},
    3,
  ])('rejects blocked or unsupported destination %j', destination => {
    expect(isSafeDestination(destination)).toBe(false);
  });
});
