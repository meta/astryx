// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file RadioList.tsx
 * @input Uses React useId, useCallback, useRef, layer-scoped context, ReactNode, Field, InputStatus
 * @output Exports RadioList component, RadioListProps, RadioListContext
 * @position Core implementation; consumed by index.ts, tested by RadioList.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/RadioList/RadioList.doc.mjs
 * - /packages/core/src/RadioList/RadioList.test.tsx
 * - /packages/core/src/RadioList/index.ts
 * - /apps/storybook/stories/RadioList.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/RadioList/ (showcase blocks)
 */

import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';
import React, {
  useCallback,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import {Field} from '../Field/Field';
import type {InputStatus} from '../Field/types';
import {useTooltip} from '../Tooltip';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {isRtlElement} from '../hooks/isRtlElement';
import {composeEventHandlers, mergeProps} from '../utils';
import {joinAriaIDs} from '../utils/inputAria';
import {
  type FieldInputBaseProps,
  useFieldInputStyling,
} from '../Field/fieldParts';
import type {SizeValue} from '../utils/types';
import {themeProps} from '../utils/themeProps';
import {RadioListPrivateContext} from './RadioListPrivateContext';

/**
 * Size of the radio controls, matching CheckboxInput sizes.
 */
export type RadioListSize = 'sm' | 'md';

export interface RadioListContextValue {
  name: string;
  value: string;
  onChange: (value: string) => void;
  isDisabled: boolean;
  /**
   * True when the whole group is disabled *and* a `disabledMessage` is set.
   */
  hasDisabledMessage: boolean;
  isRequired: boolean;
  size: RadioListSize;
  status?: InputStatus;
}

export const RadioListContext = createContext<RadioListContextValue | null>(
  null,
);
RadioListContext.displayName = 'RadioListContext';

const styles = stylex.create({
  radiogroup: {
    display: 'flex',
  },
  vertical: {
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
  },
  horizontal: {
    flexDirection: 'row',
    gap: spacingVars['--spacing-5'],
  },
});

export interface RadioListProps extends Omit<
  FieldInputBaseProps<HTMLDivElement>,
  'onChange'
> {
  /** Ref forwarded to the `role="radiogroup"` element. */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Label text for the radio group (always rendered for accessibility).
   */
  label: string;
  /**
   * Whether to visually hide the label (still accessible to screen readers).
   * @default false
   */
  isLabelHidden?: boolean;
  /**
   * Description text displayed below the label.
   */
  description?: string;
  /**
   * The currently selected value.
   */
  value: string;
  /**
   * Callback fired when the selected value changes.
   */
  onChange: (value: string) => void;
  /**
   * Runs before arrow selection. Calling preventDefault cancels it.
   */
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  /**
   * Layout direction of the radio items.
   * @default "vertical"
   */
  orientation?: 'vertical' | 'horizontal';
  /**
   * Whether all radio items are disabled.
   * @default false
   */
  isDisabled?: boolean;

  /**
   * The HTML name attribute shared by the enabled radio inputs in the group.
   * Useful for form submissions; when omitted, a unique internal name is
   * generated so the group still roves correctly.
   */
  htmlName?: string;
  /**
   * Explains why the radio group is disabled. Applies to the whole-group
   * disabled state (`isDisabled`), not individual items. When set together with
   * `isDisabled`, the group shows a tooltip with this text on hover and keyboard
   * focus, and its radios stay focusable (via `aria-disabled`) so the reason is
   * discoverable by keyboard and assistive technology. Selection stays blocked.
   *
   * Use this instead of wrapping a disabled group in `Tooltip`.
   */
  disabledMessage?: string;
  /**
   * Whether the radio group is required.
   * @default false
   */
  isRequired?: boolean;
  /**
   * Whether the field is optional. Mutually exclusive with isRequired.
   * @default false
   */
  isOptional?: boolean;
  /**
   * Status indicator for the radio group.
   * When set with a message, displays a colored message box below the group.
   */
  status?: InputStatus;
  /**
   * The size of the radio controls.
   * - 'sm': Compact size (20px radio)
   * - 'md': Default size (24px radio)
   * @default 'md'
   */
  size?: RadioListSize;
  /**
   * Width of the field. Numbers are treated as pixels, strings are used as-is
   * (e.g. `'100%'`). Sizes the whole field (label, control, and status) so they
   * stay aligned, unlike setting width via `xstyle`/`className`/`style`.
   */
  width?: SizeValue;
  /**
   * Tooltip text to display in an info icon at the end of the label.
   */
  labelTooltip?: string;
  /**
   * Test ID for the outer container.
   */
  'data-testid'?: string;
  /**
   * Radio list items to render.
   */
  children: ReactNode;
}

/**
 * A radio group component for single-value selection.
 *
 * @example
 * ```
 * <RadioList
 *   label="Notification preference"
 *   value={selected}
 *   onChange={setSelected}>
 *   <RadioListItem label="Email" value="email" />
 *   <RadioListItem label="SMS" value="sms" />
 *   <RadioListItem label="Push" value="push" />
 * </RadioList>
 * ```
 */
export function RadioList({
  ref,
  label,
  isLabelHidden = false,
  description,
  value,
  onChange,
  orientation = 'vertical',
  isDisabled = false,
  disabledMessage,
  isRequired = false,
  isOptional = false,
  size = 'md',
  status,
  labelTooltip,
  width,
  containerXstyle,
  containerClassName,
  containerStyle,
  controlXstyle,
  controlClassName,
  controlStyle,
  htmlName,
  children,
  onFocus,
  onKeyDown,
  'aria-labelledby': ariaLabelledByProp,
  'aria-describedby': ariaDescribedByProp,
  ...restProps
}: RadioListProps) {
  const {rest, container} = useFieldInputStyling('RadioList', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  const autoName = useId();
  const name = htmlName ?? autoName;
  const inputID = useId();
  const labelID = useId();
  const descriptionID = useId();
  const statusMessageID = useId();

  const groupRef = useRef<HTMLDivElement>(null);

  // The radiogroup exposes the *effective* required state so a form-wide
  // `defaultOptionality="required"` is announced even when the group carries no
  // visible indicator. Individual radios keep their native `required` bound to
  // the explicit `isRequired` (via context), so a layout default never switches
  // on browser validation for the group.
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});

  // Disabled-reason tooltip. Applies to the whole-group disabled state.
  // Selection is blocked in the item's onChange guard.
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The radiogroup container is not naturally focusable; focusin bubbles up
    // from the radios, so always attach focus listeners.
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });

  const contextValue = useMemo<RadioListContextValue>(
    () => ({
      name,
      value,
      onChange,
      isDisabled,
      hasDisabledMessage: showsDisabledMessage,
      isRequired,
      size,
      status,
    }),
    [
      name,
      value,
      onChange,
      isDisabled,
      showsDisabledMessage,
      isRequired,
      size,
      status,
    ],
  );

  // Disabled members have a private native name and no form owner. Repair
  // that split only while the checked radio can own the group's Tab stop.
  // Query the mounted controls rather than interpreting opaque children or
  // assuming that the controlled value matches an option.
  // Ref cleanup precedes host removal. Keep departures across prop updates,
  // without retaining removed nodes beyond this group's lifetime.
  const detachedRef = useRef(new WeakSet<HTMLInputElement>());
  const nativeSync = useMemo(() => {
    const normalize = (element: HTMLElement, committed: boolean) => {
      // Member effects/ref attachment precede the group's ref on first mount.
      const group = element.closest('[role="radiogroup"]');
      if (!group) {
        return;
      }
      const radios = Array.from(
        group.querySelectorAll<HTMLInputElement>(
          'input[data-radio-list-input]',
        ),
      ).filter(
        radio =>
          radio.closest('[role="radiogroup"]') === group &&
          (committed || !detachedRef.current.has(radio)),
      );
      if (committed) {
        for (const radio of radios) {
          // StrictMode can replay a later sibling's ref after this member's
          // consumer effect. All form mutations are already complete here:
          // restore only enabled names released by our own ref cleanups.
          if (
            detachedRef.current.has(radio) &&
            radio.name === '' &&
            radio.getAttribute('aria-disabled') !== 'true'
          ) {
            radio.name = name;
          }
        }
        detachedRef.current = new WeakSet();
      }
      const checked = radios.find(radio => radio.checked);
      const hasAvailableItem = radios.some(
        radio => !radio.hasAttribute('data-radio-item-disabled'),
      );
      let tabStop =
        checked &&
        radios.some(
          radio => radio.form !== checked.form || radio.name !== checked.name,
        )
          ? checked
          : undefined;
      if (tabStop) {
        const view = tabStop.ownerDocument.defaultView;
        for (
          let element: HTMLElement | null = tabStop;
          element;
          element = element.parentElement
        ) {
          const style = view?.getComputedStyle(element);
          if (
            element.hasAttribute('inert') ||
            style?.display === 'none' ||
            (element === tabStop &&
              (style?.visibility === 'hidden' ||
                style?.visibility === 'collapse'))
          ) {
            tabStop = undefined;
            break;
          }
        }
      }
      for (const radio of radios) {
        // Native required groups count a checked disabled member even though
        // its value is not submitted. Do not make enabled siblings invalidate
        // the form just because that checked member is in a different native
        // group. Visibility/inertness affects entry, not checked participation.
        radio.required =
          isRequired &&
          (!checked ||
            (checked.form === radio.form && checked.name === radio.name));
        radio.tabIndex = tabStop
          ? radio === tabStop
            ? 0
            : -1
          : radio !== checked &&
              hasAvailableItem &&
              radio.hasAttribute('data-radio-item-disabled')
            ? -1
            : 0;
      }
    };
    return {
      sync(element: HTMLElement) {
        // All host mutations are complete at attachment/layout or observation.
        // Include later siblings even before their refs attach, and restore
        // members whose refs were only replayed by StrictMode.
        normalize(element, true);
      },
      detach(radio: HTMLInputElement) {
        detachedRef.current.add(radio);
        normalize(radio, false);
      },
    };
  }, [isRequired, name]);

  const privateContextValue = useMemo(
    () => ({
      disabledName: `${autoName}-disabled`,
      disabledDescriptionID: showsDisabledMessage
        ? disabledMessageTooltip.describedBy
        : undefined,
      nativeSync,
    }),
    [
      autoName,
      showsDisabledMessage,
      disabledMessageTooltip.describedBy,
      nativeSync,
    ],
  );

  useIsomorphicLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const sync = () => nativeSync.sync(group);
    sync();
    // Member commits synchronize immediately through the private bridge. Keep
    // observing independent caller-owned row visibility/DOM changes, but not
    // our own required/tabindex writes. This group owns the observer's lifetime.
    const observer = new MutationObserver(sync);
    observer.observe(group, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'checked',
        'name',
        'form',
        'data-radio-item-disabled',
        'class',
        'style',
        'hidden',
        'inert',
      ],
    });
    return () => observer.disconnect();
  });

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      event.defaultPrevented ||
      !/^Arrow(Up|Down|Left|Right)$/.test(event.key)
    ) {
      return;
    }
    const group = groupRef.current;
    const target = event.target;
    if (
      !group ||
      !(target instanceof HTMLInputElement) ||
      !target.hasAttribute('data-radio-list-input') ||
      target.closest('[role="radiogroup"]') !== group
    ) {
      return;
    }
    const radios = Array.from(
      group.querySelectorAll<HTMLInputElement>('input[data-radio-list-input]'),
    ).filter(radio => radio.closest('[role="radiogroup"]') === group);
    // Native arrows still own ordinary groups, including whole-group disabled
    // discovery. The individual-disabled fallback spans the list's native
    // name/form split so a focused disabled member can reach enabled peers.
    if (
      target.form ||
      !radios.some(radio => radio.hasAttribute('data-radio-item-disabled'))
    ) {
      return;
    }
    event.preventDefault();
    const backwards =
      event.key === 'ArrowUp' ||
      (isRtlElement(group)
        ? event.key === 'ArrowRight'
        : event.key === 'ArrowLeft');
    const step = backwards ? -1 : 1;
    const start = radios.indexOf(target);
    for (let offset = 1; offset <= radios.length; offset++) {
      const next =
        radios[(start + step * offset + radios.length) % radios.length];
      if (!next.hasAttribute('data-radio-item-disabled')) {
        next.focus();
        // Preserve native skipping of hidden, inert, or otherwise unfocusable
        // options. A failed focus move must never select that option.
        if (next.ownerDocument.activeElement === next) {
          next.click();
          return;
        }
      }
    }
  };

  /**
   * Make the tab stop deterministic when a radio group has no selected value.
   *
   * Native `<input type="radio">` groups (same `name`) implement roving
   * tabindex for free: when a value is selected, that radio is the single tab
   * stop and receives focus, so no correction is needed there. But the ARIA
   * radio-group pattern (APG) also requires a deterministic tab stop when the
   * group has *no* selection — and browsers disagree here. Chrome, when
   * Shift+Tab moves focus backward into an unselected group, lands on the
   * *last* radio; forward Tab lands on the *first*. To keep the entry point
   * predictable we redirect focus:
   *   - forward entry  → first enabled radio (APG default)
   *   - backward entry → last enabled radio (matches Chrome's backward tab)
   *
   * The redirect only runs when focus arrives from *outside* the group's own
   * radios (guarded via `relatedTarget` containment). Moving between radios
   * inside the group — arrow keys, clicks, programmatic focus of a sibling —
   * is never hijacked.
   */
  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      // Only correct the no-selection case; a selected value already provides
      // a deterministic native tab stop.
      if (value !== '') {
        return;
      }

      const group = groupRef.current;
      if (!group) {
        return;
      }

      // Ignore focus moving *within* the group. `relatedTarget` is the element
      // losing focus; if it was inside the group, this is intra-group movement
      // (arrow keys, clicking a sibling) and must not be hijacked. Some browsers
      // report a null `relatedTarget`; fall back to checking whether the group
      // already contained the active element before this focus landed.
      const relatedTarget = e.relatedTarget as Node | null;
      if (relatedTarget) {
        if (group.contains(relatedTarget)) {
          return;
        }
      } else if (
        document.activeElement &&
        document.activeElement !== e.target &&
        group.contains(document.activeElement)
      ) {
        return;
      }

      const radios = Array.from(
        group.querySelectorAll<HTMLInputElement>(
          'input[data-radio-list-input]:not([data-radio-item-disabled])',
        ),
      ).filter(radio => radio.closest('[role="radiogroup"]') === group);
      if (radios.length === 0) {
        return;
      }

      const target = e.target as HTMLElement;
      const targetIndex = radios.findIndex(radio => radio === target);
      // Only correct when the focus target is one of our enabled radios (not a
      // nested control such as end-content).
      if (targetIndex === -1) {
        return;
      }

      // Infer tab direction from which end the browser chose. On a backward
      // (Shift+Tab) entry into an unselected group, browsers focus the *last*
      // radio; keep it as the deterministic backward tab stop. Any other entry
      // (forward Tab, or a browser that lands mid-group) is normalized to the
      // *first* enabled radio, the APG default.
      const isBackwardEntry = targetIndex === radios.length - 1;
      const intended = isBackwardEntry ? radios[radios.length - 1] : radios[0];

      if (target !== intended) {
        intended.focus();
      }
    },
    [value],
  );

  return (
    <Field
      {...container}
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={inputID}
      labelID={labelID}
      isGroupLabel
      descriptionID={description ? descriptionID : undefined}
      isOptional={isOptional}
      isRequired={isRequired}
      isDisabled={isDisabled}
      status={
        status
          ? {
              type: status.type,
              message: status.message,
              messageID: status.message ? statusMessageID : undefined,
            }
          : undefined
      }
      labelTooltip={labelTooltip}
      statusVariant="detached"
      width={width}>
      <div
        {...rest}
        ref={el => {
          groupRef.current = el;
          if (typeof ref === 'function') {
            ref(el);
          } else if (ref) {
            ref.current = el;
          }
          // Anchor + hover/focus listeners for the disabled-message tooltip.
          // Handlers are gated internally by isEnabled, so attaching
          // unconditionally is safe.
          disabledMessageTooltip.ref(el);
        }}
        role="radiogroup"
        // A caller aria-labelledby names the group together with its label.
        aria-labelledby={joinAriaIDs(labelID, ariaLabelledByProp)}
        onFocus={composeEventHandlers(handleFocus, onFocus)}
        onKeyDown={composeEventHandlers(onKeyDown, handleKeyDown)}
        aria-describedby={
          [
            ariaDescribedByProp,
            description ? descriptionID : null,
            status?.message ? statusMessageID : null,
            showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
          ]
            .filter(Boolean)
            .join(' ') || undefined
        }
        aria-invalid={status?.type === 'error' ? true : undefined}
        aria-required={isEffectivelyRequired || undefined}
        {...mergeProps(
          themeProps('radio-list', {orientation, size}),
          stylex.props(
            styles.radiogroup,
            orientation === 'vertical' ? styles.vertical : styles.horizontal,
            controlXstyle,
          ),
          controlClassName,
          controlStyle,
        )}>
        <RadioListContext value={contextValue}>
          <RadioListPrivateContext value={privateContextValue}>
            {children}
          </RadioListPrivateContext>
        </RadioListContext>
      </div>
      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </Field>
  );
}

RadioList.displayName = 'RadioList';
