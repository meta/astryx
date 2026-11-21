// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {colorVars} from '../theme/tokens.stylex';
import {publishRowState} from './rowPaint';

const WASH = colorVars['--color-accent-muted'];

function paint(row: HTMLTableRowElement) {
  return {
    background: row.style.backgroundColor,
    overlay: row.style.getPropertyValue('--table-row-overlay'),
  };
}

const WASHED = {background: WASH, overlay: WASH};
const PLAIN = {background: '', overlay: ''};

describe('publishRowState', () => {
  it('paints a selected, highlighted row with the wash on the row and its overlay', () => {
    const row = document.createElement('tr');
    publishRowState(row, 'selection', {selected: true, highlight: true});
    expect(paint(row)).toEqual(WASHED);
  });

  it('paints nothing for an unselected row, or a selected one without highlight', () => {
    const row = document.createElement('tr');
    publishRowState(row, 'selection', {selected: false, highlight: true});
    expect(paint(row)).toEqual(PLAIN);
    publishRowState(row, 'selection', {selected: true, highlight: false});
    expect(paint(row)).toEqual(PLAIN);
  });

  it('turning highlight off while selected takes the wash off', () => {
    const row = document.createElement('tr');
    publishRowState(row, 'selection', {selected: true, highlight: true});
    publishRowState(row, 'selection', {selected: true, highlight: false});
    expect(paint(row)).toEqual(PLAIN);
  });

  it('gives the same result whichever source publishes first', () => {
    const selectionFirst = document.createElement('tr');
    publishRowState(selectionFirst, 'selection', {
      selected: true,
      highlight: true,
    });
    publishRowState(selectionFirst, 'activation', {});

    const otherFirst = document.createElement('tr');
    publishRowState(otherFirst, 'activation', {});
    publishRowState(otherFirst, 'selection', {selected: true, highlight: true});

    expect(paint(selectionFirst)).toEqual(WASHED);
    expect(paint(otherFirst)).toEqual(WASHED);
  });

  it('a second source withdrawing keeps the first source paint', () => {
    const row = document.createElement('tr');
    publishRowState(row, 'selection', {selected: true, highlight: true});
    publishRowState(row, 'activation', {});
    publishRowState(row, 'activation', null);
    expect(paint(row)).toEqual(WASHED);
  });

  it('withdrawing the state clears the paint, so a row keeps none across generations', () => {
    const row = document.createElement('tr');
    publishRowState(row, 'selection', {selected: true, highlight: true});
    publishRowState(row, 'selection', null);
    expect(paint(row)).toEqual(PLAIN);
  });

  it('writes nothing when the fill does not change', () => {
    const row = document.createElement('tr');
    publishRowState(row, 'selection', {selected: true, highlight: true});
    const writes: string[] = [];
    const style = row.style;
    const setProperty = style.setProperty.bind(style);
    style.setProperty = (name, value) => {
      writes.push(name);
      setProperty(name, value);
    };
    publishRowState(row, 'selection', {selected: true, highlight: true});
    expect(writes).toEqual([]);
  });
});
