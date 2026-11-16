// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {mergeProps} from './mergeProps';

describe('mergeProps', () => {
  describe('string-first form (xdsClass, stylexResult, className?, style?)', () => {
    it('returns the xds class alone when the stylex result has no class', () => {
      expect(mergeProps('astryx-button', {className: ''})).toEqual({
        className: 'astryx-button',
        style: undefined,
      });
    });

    it('prefixes the xds class before the stylex class name', () => {
      expect(mergeProps('astryx-button', {className: 'x1 x2'})).toEqual({
        className: 'astryx-button x1 x2',
        style: undefined,
      });
    });

    it('appends a consumer className after the stylex classes', () => {
      expect(
        mergeProps('astryx-button', {className: 'x1'}, 'consumer'),
      ).toEqual({
        className: 'astryx-button x1 consumer',
        style: undefined,
      });
    });

    it('omits the consumer className when it is falsy', () => {
      expect(mergeProps('astryx-button', {className: 'x1'}, undefined)).toEqual(
        {
          className: 'astryx-button x1',
          style: undefined,
        },
      );
      expect(mergeProps('astryx-button', {className: 'x1'}, '')).toEqual({
        className: 'astryx-button x1',
        style: undefined,
      });
    });

    it('defaults the stylex result to an empty class when omitted', () => {
      expect(mergeProps('astryx-button')).toEqual({
        className: 'astryx-button',
        style: undefined,
      });
    });

    it('lets the consumer style override the stylex style key-by-key', () => {
      const result = mergeProps(
        'astryx-button',
        {className: 'x1', style: {color: 'red', margin: 0}},
        undefined,
        {color: 'blue'},
      );
      expect(result.style).toEqual({color: 'blue', margin: 0});
    });

    it('uses only the stylex style when no consumer style is given', () => {
      const result = mergeProps('astryx-button', {
        className: 'x1',
        style: {color: 'red'},
      });
      expect(result.style).toEqual({color: 'red'});
    });

    it('uses only the consumer style when the stylex result has none', () => {
      const result = mergeProps('astryx-button', {className: 'x1'}, undefined, {
        color: 'blue',
      });
      expect(result.style).toEqual({color: 'blue'});
    });

    it('preserves extra keys from the stylex result via spread', () => {
      const result = mergeProps('astryx-button', {
        className: 'x1',
        'data-style-src': 'stylex',
      });
      expect(result['data-style-src']).toBe('stylex');
    });
  });

  describe('object-first form (arbitrary prop merge)', () => {
    it('space-joins class names from both objects', () => {
      expect(mergeProps({className: 'a'}, {className: 'b'})).toEqual({
        className: 'a b',
      });
    });

    it('keeps the single class name when only one side has one', () => {
      expect(mergeProps({className: 'a'}, {})).toEqual({className: 'a'});
      expect(mergeProps({}, {className: 'b'})).toEqual({className: 'b'});
    });

    it('drops className entirely when neither side has one', () => {
      const result = mergeProps({id: 'x'}, {role: 'button'});
      expect('className' in result).toBe(false);
      expect(result).toEqual({id: 'x', role: 'button'});
    });

    it('lets override props win over base props', () => {
      expect(mergeProps({role: 'button', id: 'a'}, {id: 'b'})).toEqual({
        role: 'button',
        id: 'b',
      });
    });

    it('merges styles with the override winning per key', () => {
      const result = mergeProps(
        {style: {color: 'red', margin: 0}},
        {style: {color: 'green'}},
      );
      expect(result.style).toEqual({color: 'green', margin: 0});
    });

    it('drops style entirely when neither side has one', () => {
      const result = mergeProps({id: 'x'}, {id: 'y'});
      expect('style' in result).toBe(false);
    });

    it('treats a string third argument as an appended className', () => {
      expect(mergeProps({className: 'a'}, {className: 'b'}, 'c')).toEqual({
        className: 'a b c',
      });
    });

    it('treats an object third argument as a style', () => {
      const result = mergeProps({className: 'a'}, {}, {color: 'red'});
      expect(result).toEqual({className: 'a', style: {color: 'red'}});
    });

    it('applies the fourth argument as an overriding style', () => {
      const result = mergeProps({style: {color: 'red'}}, {}, undefined, {
        color: 'blue',
      });
      expect(result.style).toEqual({color: 'blue'});
    });

    it('accepts a string second argument as a className', () => {
      expect(mergeProps({className: 'a'}, 'b')).toEqual({className: 'a b'});
    });

    it('merges arbitrary data attributes, override winning', () => {
      const result = mergeProps(
        {'data-variant': 'primary', 'data-size': 'md'},
        {'data-size': 'lg'},
      );
      expect(result).toEqual({'data-variant': 'primary', 'data-size': 'lg'});
    });

    it('does not mutate the input objects', () => {
      const base = {className: 'a', style: {color: 'red'}};
      const overrides = {className: 'b', style: {color: 'blue'}};
      mergeProps(base, overrides);
      expect(base).toEqual({className: 'a', style: {color: 'red'}});
      expect(overrides).toEqual({className: 'b', style: {color: 'blue'}});
    });

    it('ignores a null third argument (no style, no class added)', () => {
      const result = mergeProps({className: 'a'}, {className: 'b'}, undefined);
      expect(result).toEqual({className: 'a b'});
    });

    it('merges classNames and styles across all four arguments in one pass', () => {
      const result = mergeProps(
        {className: 'c1', style: {margin: 0}, id: 'x'},
        {className: 'c2', style: {color: 'red'}, role: 'button'},
        'c3',
        {fontSize: 12},
      );
      expect(result).toEqual({
        id: 'x',
        role: 'button',
        className: 'c1 c2 c3',
        style: {margin: 0, color: 'red', fontSize: 12},
      });
    });
  });
});
