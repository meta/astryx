// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file touchTarget.test.tsx
 * @input CheckboxInput, RadioList and CheckboxList in jsdom, their injected
 *   styles, the shared hit band, and stubbed element rects
 * @output Checks the hit band under a coarse pointer. A labelled checkbox and
 *   an enabled radio option carry it and keep their size. A tap on a
 *   checkbox's band toggles it. Composed rows keep their pitch. The band's
 *   geometry is checked in the browser layer.
 * @position Unit layer; the browser layer is
 *   Indicator/__tests__/TouchTargets.interaction.browser.spec.ts
 */

import * as stylex from '@stylexjs/stylex';
import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {CheckboxInput} from '../CheckboxInput/CheckboxInput';
import {CheckboxList} from '../CheckboxList/CheckboxList';
import {CheckboxListItem} from '../CheckboxList/CheckboxListItem';
import {RadioList} from '../RadioList/RadioList';
import {RadioListItem} from '../RadioList/RadioListItem';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';

interface Declared {
  media: string | null;
  text: string;
}

/** Every injected rule naming one of the element's classes, with its media. */
function declaredFor(el: Element): Declared[] {
  const classes = el.className
    .split(/\s+/)
    .filter(Boolean)
    .map(name => `.${name}`);
  const out: Declared[] = [];
  const walk = (rules: CSSRuleList, media: string | null) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, rule.media.mediaText);
      } else if (
        rule instanceof CSSStyleRule &&
        classes.some(cls => rule.selectorText.startsWith(cls))
      ) {
        out.push({media, text: rule.style.cssText});
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    walk(sheet.cssRules, null);
  }
  return out;
}

/** The value `property` takes on `el` under `media` (null: unconditionally). */
function valueOf(
  el: Element,
  property: string,
  media: string | null,
): string | undefined {
  for (const rule of declaredFor(el)) {
    if (rule.media !== media) {
      continue;
    }
    const match = new RegExp(`(?:^|;\\s*)${property}:\\s*([^;]+)`).exec(
      rule.text,
    );
    if (match) {
      return match[1].trim();
    }
  }
  return undefined;
}

/** The block padding `el` declares under `media`, as [start, end]. */
function paddingBlockOf(el: Element, media: string | null): string[] {
  const both = valueOf(el, 'padding-block', media);
  if (both != null) {
    const [start, end = start] = both.split(/\s+(?![^(]*\))/);
    return [start, end];
  }
  const start =
    valueOf(el, 'padding-top', media) ??
    valueOf(el, 'padding-block-start', media);
  const end =
    valueOf(el, 'padding-bottom', media) ??
    valueOf(el, 'padding-block-end', media);
  return start == null && end == null ? [] : [start ?? '', end ?? ''];
}

/** Whether `el` carries every class of the shared hit band. */
function hasHitLayer(el: Element): boolean {
  const layer = (stylex.props(touchHitAreaStyles.band).className ?? '')
    .split(/\s+/)
    .filter(name => name !== '' && !name.startsWith('touchHitArea__'));
  if (layer.length === 0) {
    throw new Error('the hit band has no classes');
  }
  return layer.every(name => el.classList.contains(name));
}

function closestOrThrow(el: Element, selector: string): HTMLElement {
  const found = el.closest(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no ${selector} around the control`);
  }
  return found;
}

const TOUCH = '(pointer: coarse)';

describe('CheckboxInput under a finger', () => {
  it('keeps a labelled checkbox’s row at its size and gives it the hit band (FR42)', () => {
    render(
      <CheckboxInput label="Accept terms" value={false} onChange={() => {}} />,
    );
    const row = closestOrThrow(
      screen.getByRole('checkbox', {name: 'Accept terms'}),
      '[data-astryx-pressable]',
    );
    expect(valueOf(row, 'min-height', TOUCH)).toBeUndefined();
    expect(valueOf(row, 'min-height', null)).toBeUndefined();
    expect(hasHitLayer(row)).toBe(true);
    // The row holds the band only under a finger; a mouse sees no change.
    expect(valueOf(row, 'position', TOUCH)).toBe('relative');
    expect(valueOf(row, 'position', null)).toBeUndefined();
  });

  it('gives a label-hidden, disabled or read-only checkbox no hit band', () => {
    render(
      <>
        <CheckboxInput
          label="Marker"
          isLabelHidden
          value={false}
          onChange={() => {}}
        />
        <CheckboxInput
          label="Disabled"
          isDisabled
          value={false}
          onChange={() => {}}
        />
        <CheckboxInput
          label="Read-only"
          isReadOnly
          value={false}
          onChange={() => {}}
        />
      </>,
    );
    for (const name of ['Marker', 'Disabled', 'Read-only']) {
      const input = screen.getByRole('checkbox', {name});
      const row =
        input.closest('[data-astryx-pressable]') ?? input.parentElement;
      if (row == null) {
        throw new Error(`no row for ${name}`);
      }
      expect(hasHitLayer(row), name).toBe(false);
    }
  });

  it('toggles on a press that begins on the band, even when its click lands on the row’s edge, and not on a press inside the row or a click from code', () => {
    const onChange = vi.fn();
    render(
      <CheckboxInput label="Accept terms" value={false} onChange={onChange} />,
    );
    const row = closestOrThrow(
      screen.getByRole('checkbox', {name: 'Accept terms'}),
      '[data-astryx-pressable]',
    );
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({x: 10, y: 10, width: 200, height: 24}),
    );
    // A press inside the row's own box (between box and label): unchanged.
    fireEvent.pointerDown(row, {clientX: 30, clientY: 20});
    fireEvent.click(row, {clientX: 30, clientY: 20, detail: 1});
    // A click from code on the band, with no press: unchanged.
    fireEvent.click(row, {clientX: 30, clientY: 5});
    expect(onChange).not.toHaveBeenCalled();
    // A press on the band whose click the browser moved onto the row's top.
    fireEvent.pointerDown(row, {clientX: 30, clientY: 2});
    fireEvent.click(row, {clientX: 30, clientY: 10, detail: 1});
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toBe(true);
  });
});

describe('CheckboxList under a finger', () => {
  function rowOf(name: string): Element {
    return closestOrThrow(screen.getByRole('checkbox', {name}), 'li');
  }

  it('sets no touch row height or padding at any density', () => {
    for (const density of ['compact', 'balanced', 'spacious'] as const) {
      const {unmount} = render(
        <CheckboxList
          label={`Notifications ${density}`}
          value={['email']}
          onChange={() => {}}
          density={density}>
          <CheckboxListItem
            label={`Email ${density}`}
            value="email"
            description="Weekly digest"
          />
          <CheckboxListItem label={`SMS ${density}`} value="sms" />
        </CheckboxList>,
      );
      for (const name of [`Email ${density}`, `SMS ${density}`]) {
        expect(valueOf(rowOf(name), 'min-height', TOUCH), name).toBeUndefined();
        expect(paddingBlockOf(rowOf(name), TOUCH), name).toEqual([]);
      }
      unmount();
    }
  });

  it('keeps a read-only compact list at its pitch, as Markdown’s task list', () => {
    render(
      <CheckboxList
        label="Tasks"
        isLabelHidden
        value={['done']}
        onChange={() => {}}
        isReadOnly
        density="compact">
        <CheckboxListItem label="Done" value="done" />
        <CheckboxListItem label="Open" value="open" />
      </CheckboxList>,
    );
    expect(valueOf(rowOf('Open'), 'min-height', TOUCH)).toBeUndefined();
    expect(paddingBlockOf(rowOf('Open'), TOUCH)).toEqual([]);
  });
});

describe('RadioList under a finger', () => {
  it('keeps each row’s size and the list’s gap: no touch height, padding or gap (FR42)', () => {
    for (const orientation of ['vertical', 'horizontal'] as const) {
      const {unmount} = render(
        <RadioList
          label={`Plan ${orientation}`}
          value="a"
          orientation={orientation}
          onChange={() => {}}>
          <RadioListItem label={`Option A ${orientation}`} value="a" />
          <RadioListItem label={`Option B ${orientation}`} value="b" />
        </RadioList>,
      );
      const row = closestOrThrow(
        screen.getByRole('radio', {name: `Option B ${orientation}`}),
        '.astryx-item',
      );
      expect(valueOf(row, 'min-height', TOUCH)).toBeUndefined();
      expect(paddingBlockOf(row, TOUCH)).toEqual([]);
      const touchGaps = declaredFor(screen.getByRole('radiogroup')).filter(
        rule =>
          rule.media?.startsWith(TOUCH) === true &&
          /(?:^|;\s*)(?:row-)?gap:/.test(rule.text),
      );
      expect(touchGaps).toEqual([]);
      unmount();
    }
  });

  it('gives each enabled option the hit band and a disabled one none (FR42)', () => {
    render(
      <RadioList label="Plan" value="a" onChange={() => {}}>
        <RadioListItem label="Option A" value="a" />
        <RadioListItem label="Option B" value="b" isDisabled />
      </RadioList>,
    );
    const rowOf = (name: string) =>
      closestOrThrow(screen.getByRole('radio', {name}), '.astryx-item');
    expect(hasHitLayer(rowOf('Option A'))).toBe(true);
    expect(hasHitLayer(rowOf('Option B'))).toBe(false);
  });
});
