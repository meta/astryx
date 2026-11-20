// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SlotFollowsMark.test.tsx
 * @input CheckboxInput and RadioListItem at both sizes
 * @output Verifies the slot around the indicator sets no size of its own (it
 *   is as big as the indicator), while the hidden input keeps the size's full
 *   hit area
 * @position Regression test for component:CheckboxInput FR12 and
 *   component:RadioListItem FR9; real geometry (a theme-sized box, the
 *   centered 24px hit area, the focus ring) is in
 *   SlotFollowsMark.interaction.browser.spec.ts
 */

import {render} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {CheckboxInput} from '../CheckboxInput';
import {RadioList, RadioListItem} from '../../RadioList';

const SIZES = [
  ['sm', '20px'],
  ['md', '24px'],
] as const;

describe('the slot around a checkbox or radio indicator', () => {
  it.each(SIZES)(
    'CheckboxInput %s: follows the box; the input keeps %s',
    (size, px) => {
      const {container} = render(
        <CheckboxInput label="A" size={size} value onChange={() => {}} />,
      );
      const input = container.querySelector('input') as HTMLInputElement;
      const slot = input.parentElement as HTMLElement;
      expect(getComputedStyle(slot).width).toBe('');
      expect(getComputedStyle(slot).height).toBe('');
      expect(getComputedStyle(input).width).toBe(px);
      expect(getComputedStyle(input).height).toBe(px);
    },
  );

  it.each(SIZES)(
    'RadioListItem %s: follows the circle; the input keeps %s',
    (size, px) => {
      const {container} = render(
        <RadioList label="R" size={size} value="a" onChange={() => {}}>
          <RadioListItem label="A" value="a" />
        </RadioList>,
      );
      const input = container.querySelector('input') as HTMLInputElement;
      const slot = input.parentElement as HTMLElement;
      expect(getComputedStyle(slot).width).toBe('');
      expect(getComputedStyle(slot).height).toBe('');
      expect(getComputedStyle(input).width).toBe(px);
      expect(getComputedStyle(input).height).toBe(px);
    },
  );
});
