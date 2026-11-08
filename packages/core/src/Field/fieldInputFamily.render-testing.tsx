// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file fieldInputFamily.render-testing.tsx
 * @input Uses Testing Library, Vitest, InputGroup, FormLayout
 * @output Exports describeFieldInputParts, the shared FR10 render suite
 * @position Test helper for family:input-fields FR10. Each Field-composed
 *   component's test file calls it with a render function and a locator for
 *   its primary semantic control.
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, fireEvent} from '@testing-library/react';
import {createRef, type ReactElement} from 'react';
import {FormLayout} from '../FormLayout';
import {InputGroup} from '../InputGroup';

export interface FieldInputPartsOptions {
  /** Render the member with extra props merged into its required props. */
  renderMember: (props: Record<string, unknown>) => ReactElement;
  /** Locate the primary semantic control after rendering. */
  getControl: () => HTMLElement;
  /** Whether the member is InputGroup-compatible. */
  inGroup?: boolean;
  /**
   * Whether the member honors a caller `id` on its control. Defaults to true;
   * set false only for a member whose control id is component-owned.
   */
  forwardsId?: boolean;
  /**
   * Whether the primary semantic control itself references the field
   * description. Defaults to true; FileInput describes its trigger button
   * instead of the hidden native input that takes base props.
   */
  controlReferencesDescription?: boolean;
}

/**
 * Shared FR10 render suite: base props reach the primary semantic control,
 * root styling is dropped with a warning, `container*` reaches the Field box
 * only where one renders, and `control*` reaches the visual control box.
 */
export function describeFieldInputParts(
  name: string,
  {
    renderMember,
    getControl,
    inGroup = false,
    forwardsId = true,
    controlReferencesDescription = true,
  }: FieldInputPartsOptions,
): void {
  describe(`${name} FR10 prop targets`, () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('forwards base props, ref, and handlers to the primary semantic control', () => {
      const ref = createRef<HTMLElement>();
      const onFocus = vi.fn();
      render(
        renderMember({
          ref,
          ...(forwardsId ? {id: 'caller-id'} : {}),
          'data-testid': 'member',
          'data-track': 'field',
          'aria-details': 'details-id',
          onFocus,
        }),
      );
      const control = getControl();
      expect(control).toHaveAttribute('data-testid', 'member');
      expect(control).toHaveAttribute('data-track', 'field');
      expect(control).toHaveAttribute('aria-details', 'details-id');
      if (forwardsId) {
        expect(control).toHaveAttribute('id', 'caller-id');
      }
      expect(ref.current).toBe(control);
      fireEvent.focus(control);
      expect(onFocus).toHaveBeenCalled();
    });

    it('keeps a caller aria-describedby alongside the field description', () => {
      render(
        renderMember({
          'aria-describedby': 'caller-help',
          // eslint-disable-next-line @astryx/no-hardcoded-i18n-string -- test fixture text
          description: 'Field help',
        }),
      );
      const ids = (getControl().getAttribute('aria-describedby') ?? '').split(
        ' ',
      );
      expect(ids).toContain('caller-help');
      if (!controlReferencesDescription) {
        return;
      }
      const describedText = ids
        .map(id => document.getElementById(id)?.textContent ?? '')
        .join(' ');
      expect(describedText).toContain('Field help');
    });

    it('styles the Field box with container* and the control box with control*', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const {container} = render(
        renderMember({
          containerClassName: 'fr10-container',
          containerStyle: {marginTop: '7px'},
          controlClassName: 'fr10-control',
          controlStyle: {marginBottom: '9px'},
        }),
      );
      const control = getControl();
      const fieldBox = container.querySelector('.fr10-container');
      const controlBox = container.querySelector('.fr10-control');
      expect(fieldBox).not.toBeNull();
      expect(controlBox).not.toBeNull();
      expect((fieldBox as HTMLElement).style.marginTop).toBe('7px');
      expect((controlBox as HTMLElement).style.marginBottom).toBe('9px');
      // The Field box holds the label and the control box; the control box
      // holds (or is) the control but is never the native input itself.
      expect(fieldBox).toContainElement(controlBox as HTMLElement);
      expect(fieldBox).not.toBe(controlBox);
      expect(controlBox).not.toBe(
        control.tagName === 'INPUT' || control.tagName === 'TEXTAREA'
          ? control
          : null,
      );
      expect(warn).not.toHaveBeenCalled();
    });

    it('drops untyped root styling and warns in development', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const {container} = render(
        renderMember({className: 'fr10-root', style: {outlineColor: 'red'}}),
      );
      expect(container.querySelector('.fr10-root')).toBeNull();
      expect(getControl().style.outlineColor).toBe('');
      expect(
        warn.mock.calls.some(call => String(call[0]).startsWith(`${name}:`)),
      ).toBe(true);
    });

    it('ignores container* and warns in a horizontal-labels FormLayout', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const {container} = render(
        <FormLayout direction="horizontal-labels">
          {renderMember({containerClassName: 'fr10-container'})}
        </FormLayout>,
      );
      expect(container.querySelector('.fr10-container')).toBeNull();
      expect(
        warn.mock.calls.some(call =>
          String(call[0]).includes('no Field box renders'),
        ),
      ).toBe(true);
    });

    if (inGroup) {
      it('ignores container* and warns inside InputGroup, keeping control*', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const {container} = render(
          // eslint-disable-next-line @astryx/no-hardcoded-i18n-string -- test fixture label
          <InputGroup label="Group">
            {renderMember({
              containerClassName: 'fr10-container',
              controlClassName: 'fr10-control',
            })}
          </InputGroup>,
        );
        expect(container.querySelector('.fr10-container')).toBeNull();
        expect(container.querySelector('.fr10-control')).not.toBeNull();
        expect(
          warn.mock.calls.some(call =>
            String(call[0]).includes('no Field box renders'),
          ),
        ).toBe(true);
      });
    }
  });
}
