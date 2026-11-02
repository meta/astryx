// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useRef} from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {useDismissSearchOnTouchDrag} from './useDismissSearchOnTouchDrag';

function Harness({hasSecondSearch = false}: {hasSecondSearch?: boolean}) {
  const firstRef = useRef<HTMLInputElement>(null);
  const secondRef = useRef<HTMLInputElement>(null);
  const dragProps = useDismissSearchOnTouchDrag(() => [
    firstRef.current,
    secondRef.current,
  ]);
  return (
    <>
      <input ref={firstRef} aria-label="First search" />
      {hasSecondSearch && <input ref={secondRef} aria-label="Second search" />}
      <input aria-label="Unrelated field" />
      <div role="group" aria-label="Results" {...dragProps} />
    </>
  );
}

const touches = (clientY: number) => [{clientY}];

function setup() {
  render(<Harness hasSecondSearch />);
  const search = screen.getByRole('textbox', {name: 'First search'});
  const results = screen.getByRole('group', {name: 'Results'});
  search.focus();
  return {search, results};
}

describe('useDismissSearchOnTouchDrag', () => {
  it('preserves typing across programmatic result scrolling', async () => {
    const {search, results} = setup();
    fireEvent.scroll(results, {target: {scrollTop: 300}});
    await userEvent.setup().type(search, 'Eng');
    fireEvent.scroll(results, {target: {scrollTop: 0}});
    expect(search).toHaveFocus();
    expect(search).toHaveValue('Eng');
  });

  it('blurs a focused owned search once at the direct vertical drag threshold', () => {
    const {search, results} = setup();
    const blur = vi.spyOn(search, 'blur');
    fireEvent.touchStart(results, {touches: touches(100)});
    fireEvent.touchMove(results, {touches: touches(107)});
    expect(search).toHaveFocus();
    fireEvent.touchMove(results, {touches: touches(108)});
    expect(search).not.toHaveFocus();
    fireEvent.touchMove(results, {touches: touches(120)});
    expect(blur).toHaveBeenCalledTimes(1);
  });

  it('does not blur on an unowned touch move, tap, or horizontal motion', () => {
    const {search, results} = setup();
    fireEvent.touchMove(results, {touches: touches(120)});
    expect(search).toHaveFocus();
    fireEvent.touchStart(results, {touches: [{clientY: 100, clientX: 0}]});
    fireEvent.touchMove(results, {touches: [{clientY: 100, clientX: 100}]});
    fireEvent.touchEnd(results);
    fireEvent.touchMove(results, {touches: touches(120)});
    expect(search).toHaveFocus();
  });

  it('resets ownership on cancellation and multi-touch without dismissing', () => {
    const {search, results} = setup();
    fireEvent.touchStart(results, {touches: touches(100)});
    fireEvent.touchCancel(results);
    fireEvent.touchMove(results, {touches: touches(120)});
    expect(search).toHaveFocus();
    fireEvent.touchStart(results, {touches: touches(100)});
    fireEvent.touchMove(results, {touches: [{clientY: 120}, {clientY: 140}]});
    fireEvent.touchMove(results, {touches: touches(150)});
    expect(search).toHaveFocus();
  });

  it('can dismiss either current owned input, but never an unrelated field', () => {
    const {results} = setup();
    const secondSearch = screen.getByRole('textbox', {name: 'Second search'});
    secondSearch.focus();
    fireEvent.touchStart(results, {touches: touches(100)});
    fireEvent.touchMove(results, {touches: touches(90)});
    expect(secondSearch).not.toHaveFocus();
    const unrelated = screen.getByRole('textbox', {name: 'Unrelated field'});
    unrelated.focus();
    fireEvent.touchStart(results, {touches: touches(100)});
    fireEvent.touchMove(results, {touches: touches(120)});
    expect(unrelated).toHaveFocus();
  });
});
