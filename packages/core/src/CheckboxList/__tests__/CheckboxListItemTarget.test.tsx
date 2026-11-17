// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CheckboxListItemTarget.test.tsx
 * @input CheckboxList rows beside a plain List, and a theme that sets gap on
 *   the `checkbox-list-item` target
 * @output Verifies the CheckboxList row carries its own `checkbox-list-item`
 *   target beside `item` and `list-item`, with the selected and disabled
 *   states, and that a theme's entry for it reaches CheckboxList rows only,
 *   never another list's rows
 * @position Regression test for component:CheckboxListItem FR16
 */

import {render} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {CheckboxList, CheckboxListItem} from '..';
import {List, ListItem} from '../../List';
import {defineTheme} from '../../theme';
import {generateThemeRules} from '../../theme/generateThemeRules';

const targets = (el: Element) =>
  el.className
    .split(' ')
    .filter(c => c.startsWith('astryx-'))
    .sort();

describe('the checkbox-list-item target', () => {
  it('is on CheckboxList rows, with their state, and on no other list row', () => {
    const {container} = render(
      <>
        <CheckboxList label="L" value={['a']} onChange={() => {}}>
          <CheckboxListItem label="A" value="a" />
          <CheckboxListItem label="B" value="b" isDisabled />
          <CheckboxListItem label="C" value="c" />
        </CheckboxList>
        <List>
          <ListItem label="X" />
        </List>
      </>,
    );
    const rows = [...container.querySelectorAll('.astryx-list-item')];
    expect(rows.map(targets)).toEqual([
      ['astryx-checkbox-list-item', 'astryx-item', 'astryx-list-item'],
      ['astryx-checkbox-list-item', 'astryx-item', 'astryx-list-item'],
      ['astryx-checkbox-list-item', 'astryx-item', 'astryx-list-item'],
      ['astryx-item', 'astryx-list-item'],
    ]);
    expect(rows[0].getAttribute('data-selected')).toBe('selected');
    expect(rows[1].getAttribute('data-disabled')).toBe('disabled');
    expect(rows[2].hasAttribute('data-selected')).toBe(false);
  });

  it('takes a theme gap on CheckboxList rows only', () => {
    const theme = defineTheme({
      name: 'checkbox-list-item-gap',
      components: {'checkbox-list-item': {base: {gap: '3px'}}},
    });
    const rules = generateThemeRules(theme).filter(r => r.includes('gap: 3px'));
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule).toContain('.astryx-checkbox-list-item');
      expect(rule).not.toMatch(/\.astryx-(?:list-item|item)\b(?!-)/);
    }
  });
});
