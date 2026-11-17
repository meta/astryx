// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseDocType} from './parseDocType.js';

describe('parseDocType', () => {
  it('reads words-or-a-switch, and no other union of different kinds', () => {
    expect(parseDocType('string | boolean')).toEqual({
      ok: true,
      type: {kind: 'textOrBoolean'},
    });
    expect(parseDocType('boolean | string')).toEqual({
      ok: true,
      type: {kind: 'textOrBoolean'},
    });
    expect(parseDocType('string | number').ok).toBe(false);
  });

  it('reads portable forms', () => {
    expect(parseDocType('string')).toEqual({ok: true, type: {kind: 'string'}});
    expect(parseDocType("'sm' | 'md' | 'lg'")).toEqual({
      ok: true,
      type: {kind: 'enum', values: ['sm', 'md', 'lg']},
    });
    expect(parseDocType('SelectorOption[]')).toEqual({
      ok: true,
      type: {kind: 'array', of: {kind: 'named', name: 'SelectorOption'}},
    });
    expect(parseDocType('(value: string) => void')).toEqual({
      ok: true,
      type: {kind: 'fn', args: [{kind: 'string'}]},
    });
    expect(
      parseDocType("{type: 'error' | 'warning', message?: string}"),
    ).toEqual({
      ok: true,
      type: {
        kind: 'record',
        fields: {
          type: {
            type: {kind: 'enum', values: ['error', 'warning']},
            optional: false,
          },
          message: {type: {kind: 'string'}, optional: true},
        },
      },
    });
  });

  it.each([
    ['ReactNode', 'free-form content'],
    ['IconType | ReactNode', 'web icon component'],
    ['(option: SelectorOptionData) => ReactNode', 'render function'],
    ['(event: MouseEvent) => void', 'DOM event'],
    ['StyleXStyles', 'web styling input'],
    ['number | string', 'union of different kinds'],
  ])('keeps %s out of the core', (type, reason) => {
    const parsed = parseDocType(type);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.reason).toContain(reason);
    }
  });
});

describe('parseDocType callbacks and closed number sets', () => {
  it('keeps the values of a value callback and leaves its DOM event on the web', () => {
    expect(
      parseDocType(
        '(checked: boolean, e: ChangeEvent<HTMLInputElement>) => void',
      ),
    ).toEqual({ok: true, type: {kind: 'fn', args: [{kind: 'boolean'}]}});
    expect(
      parseDocType('(value: string, event: React.ChangeEvent) => void'),
    ).toEqual({ok: true, type: {kind: 'fn', args: [{kind: 'string'}]}});
  });

  it.each([
    '(e: FocusEvent<HTMLInputElement>) => void',
    '(event: MouseEvent) => void',
  ])('keeps the event-only callback %s on the web', type => {
    expect(parseDocType(type)).toEqual({
      ok: false,
      reason: 'callback argument: DOM event',
      eventOnly: true,
    });
  });

  it('refuses an event that is not last', () => {
    const parsed = parseDocType('(e: MouseEvent, value: string) => void');
    expect(parsed).toMatchObject({
      ok: false,
      reason: 'callback argument: DOM event',
    });
    expect(parsed).not.toHaveProperty('eventOnly');
  });

  it('reads a closed set of numbers', () => {
    expect(parseDocType('1 | 2 | 3')).toEqual({
      ok: true,
      type: {kind: 'numberEnum', values: [1, 2, 3]},
    });
    expect(parseDocType('0 | 0.5 | 1')).toEqual({
      ok: true,
      type: {kind: 'numberEnum', values: [0, 0.5, 1]},
    });
    expect(parseDocType("1 | 'auto'").ok).toBe(false);
  });
});
