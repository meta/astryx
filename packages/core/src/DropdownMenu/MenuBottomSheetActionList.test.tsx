// Copyright (c) Meta Platforms, Inc. and affiliates.

import {fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {__resetMenuPressForTest} from '../hooks/useMenuPress';
import {MenuBottomSheetActionList} from './MenuBottomSheetActionList';

afterEach(() => {
  __resetMenuPressForTest();
});

const touch = (pointerId = 1) => ({pointerType: 'touch', pointerId});
const mouse = (pointerId = 1) => ({
  pointerType: 'mouse',
  pointerId,
  button: 0,
});

function renderList() {
  return render(
    <MenuBottomSheetActionList
      items={[
        {label: 'Rename', onClick: () => {}},
        {label: 'Delete', onClick: () => {}},
      ]}
      onSelect={() => {}}
      onOpenSubmenu={() => {}}
    />,
  );
}

describe('MenuBottomSheetActionList', () => {
  it('a cancelled finger clears the row it lit in the sheet\u2019s action list; a mouse keeps its highlight (spec:AST-094 FR28, spec:AST-017 FR59)', () => {
    const {unmount} = renderList();
    fireEvent.pointerDown(
      screen.getByRole('button', {name: 'Rename'}),
      touch(),
    );
    fireEvent.pointerMove(
      screen.getByRole('button', {name: 'Delete'}),
      touch(),
    );
    expect(screen.getByRole('button', {name: 'Delete'})).toHaveFocus();
    // The browser takes the touch: a scroll of the sheet, say.
    fireEvent.pointerCancel(
      screen.getByRole('button', {name: 'Delete'}),
      touch(),
    );
    expect(screen.getByRole('button', {name: 'Delete'})).not.toHaveFocus();
    unmount();

    renderList();
    fireEvent.pointerDown(
      screen.getByRole('button', {name: 'Rename'}),
      mouse(),
    );
    fireEvent.pointerMove(
      screen.getByRole('button', {name: 'Delete'}),
      mouse(),
    );
    fireEvent.pointerCancel(
      screen.getByRole('button', {name: 'Delete'}),
      mouse(),
    );
    expect(screen.getByRole('button', {name: 'Delete'})).toHaveFocus();
  });
});
