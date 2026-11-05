// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TransferListSelector.tsx
 * @input Controlled option data, uncontrolled ComplexSelector state, TransferList, action controls, and the core i18n catalog
 * @output Exports the immediate-or-staged TransferListSelector composition with draft cleanup after dismissal
 * @position Lab collection input shell; consumed by the TransferList entry point, docs, and tests
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/TransferList/TransferListSelector.test.tsx
 * - /packages/lab/src/TransferList/TransferList.doc.mjs
 * - /packages/lab/src/TransferList/index.ts
 */

import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {
  ComplexSelector,
  type ComplexSelectorProps,
} from '@astryxdesign/core/ComplexSelector';
import {useTranslator} from '@astryxdesign/core/i18n';
import {HStack} from '@astryxdesign/core/Stack';
import {borderVars, colorVars} from '@astryxdesign/core/theme/tokens.stylex';
import {TransferList, type TransferListProps} from './TransferList';

const DEFAULT_SELECTOR_WIDTH = 'min(41rem, calc(100vw - 32px))';

const styles = stylex.create({
  // Width tracks the `width` prop, so the field and its popup are one
  // measurement rather than two that can disagree.
  content: (width: string) => ({
    width,
    maxWidth: width,
    maxHeight: 'calc(100vh - 32px)',
    padding: 0,
    overflow: 'hidden',
    borderRadius: 'inherit',
  }),
  surface: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    minHeight: 0,
    maxHeight: 'inherit',
  },
  fieldset: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    minHeight: 0,
    margin: 0,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
  // Busy is not disabled: `disabled` on this fieldset would blur the Add or
  // Remove button the user just activated, dropping focus to <body>. The
  // pending state is carried by aria-busy plus the trigger's spinner, so this
  // only has to read as unavailable to the pointer.
  fieldsetBusy: {
    cursor: {
      default: 'progress',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  footer: {
    flexShrink: 0,
    borderBlockStartWidth: borderVars['--border-width'],
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: colorVars['--color-border'],
    backgroundColor: colorVars['--color-background-surface'],
  },
});

type TransferListSelectorShellProp =
  | 'label'
  | 'triggerLabel'
  | 'isLabelHidden'
  | 'description'
  | 'isOptional'
  | 'isRequired'
  | 'isDisabled'
  | 'isLoading'
  | 'status'
  | 'statusVariant'
  | 'labelTooltip'
  | 'size'
  | 'width'
  | 'placement'
  | 'controlXstyle'
  | 'controlClassName'
  | 'controlStyle'
  | 'data-testid';

type TransferListContentProp =
  | 'options'
  | 'selectedLabel'
  | 'availableLabel'
  | 'hasSearch'
  | 'searchLabel'
  | 'searchPlaceholder'
  | 'isReorderable'
  | 'hasSelectAll'
  | 'hasClear'
  | 'renderOption'
  | 'selectedEmptyText'
  | 'availableEmptyText'
  | 'noResultsText';

export type TransferListSelectorCommitBehavior = 'immediate' | 'staged';

export type TransferListSelectorProps<T extends string = string> = Pick<
  ComplexSelectorProps<readonly T[]>,
  TransferListSelectorShellProp
> &
  Pick<TransferListProps<T>, TransferListContentProp> & {
    /** Ordered values applied outside the selector. */
    value: readonly T[];
    /** Called whenever a value is committed. */
    onChange: (value: readonly T[]) => void;
    /** Optional async action after a changed value is applied. */
    changeAction?: (value: readonly T[]) => void | Promise<void>;
    /**
     * Controls when changes are committed. Immediate commits each list edit and
     * staged waits for Apply. @default 'immediate'
     */
    commitBehavior?: TransferListSelectorCommitBehavior;
    /** Label for the staged commit action. Only used in staged behavior. @default 'Apply' */
    applyLabel?: string;
    /** Label for the staged discard action. Only used in staged behavior. @default 'Cancel' */
    cancelLabel?: string;
  };

function areOrderedValuesEqual<T>(
  first: readonly T[],
  second: readonly T[],
): boolean {
  return (
    first.length === second.length &&
    first.every((item, index) => item === second[index])
  );
}

function ResetDraftAfterClose({
  isOpen,
  resetDraft,
}: {
  isOpen: boolean;
  resetDraft: () => void;
}): null {
  const wasOpenRef = useRef(isOpen);

  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      resetDraft();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, resetDraft]);

  return null;
}

/**
 * A transfer-list field that opens in a selector popover.
 *
 * The field label, description, and trigger remain outside the popup. Changes
 * commit immediately by default. Set commitBehavior="staged" when the workflow
 * needs explicit Apply and Cancel actions.
 *
 * @example
 * ```
 * <TransferListSelector
 *   label="Visible fields"
 *   options={columnOptions}
 *   value={visibleColumns}
 *   onChange={setVisibleColumns}
 * />
 * ```
 */
export function TransferListSelector<T extends string = string>({
  label,
  description,
  options,
  value,
  onChange,
  changeAction,
  commitBehavior = 'immediate',
  triggerLabel,
  isDisabled,
  isLoading,
  width,
  applyLabel: applyLabelFromProps,
  cancelLabel: cancelLabelFromProps,
  selectedLabel,
  availableLabel,
  hasSearch,
  searchLabel,
  searchPlaceholder,
  isReorderable,
  hasSelectAll,
  hasClear,
  renderOption,
  selectedEmptyText,
  availableEmptyText,
  noResultsText,
  ...selectorProps
}: TransferListSelectorProps<T>): ReactNode {
  const t = useTranslator();
  const applyLabel =
    applyLabelFromProps ?? t('@astryx.transferListSelector.apply');
  const cancelLabel =
    cancelLabelFromProps ?? t('@astryx.transferListSelector.cancel');
  const [draftValue, setDraftValue] = useState<readonly T[]>(value);

  const resetDraft = useCallback(() => {
    setDraftValue([...value]);
  }, [value]);

  // A changed applied value or commit behavior discards the staged draft.
  // Adjusted during render, so no commit paints the discarded draft.
  const [draftSource, setDraftSource] = useState(() => ({
    value: [...value],
    commitBehavior,
  }));
  if (
    !areOrderedValuesEqual(draftSource.value, value) ||
    !Object.is(draftSource.commitBehavior, commitBehavior)
  ) {
    setDraftSource({value: [...value], commitBehavior});
    setDraftValue([...value]);
  }

  const resolvedWidth =
    typeof width === 'number'
      ? `${width}px`
      : (width ?? DEFAULT_SELECTOR_WIDTH);

  return (
    <ComplexSelector
      {...selectorProps}
      label={label}
      description={description}
      value={value}
      onChange={onChange}
      changeAction={changeAction}
      triggerLabel={
        triggerLabel ??
        t('@astryx.transferListSelector.triggerLabel', {count: value.length})
      }
      isDisabled={isDisabled}
      isLoading={isLoading}
      width={resolvedWidth}
      contentXstyle={styles.content(resolvedWidth)}>
      {(appliedValue, commit, close, state) => {
        const isStaged = commitBehavior === 'staged';
        const transferListValue = isStaged ? draftValue : appliedValue;

        return (
          <div
            aria-busy={state.isBusy || undefined}
            {...stylex.props(styles.surface)}>
            {isStaged && (
              <ResetDraftAfterClose
                isOpen={state.isOpen}
                resetDraft={resetDraft}
              />
            )}
            <fieldset
              disabled={isDisabled}
              {...stylex.props(
                styles.fieldset,
                state.isBusy && styles.fieldsetBusy,
              )}>
              <TransferList
                label={label}
                isLabelHidden
                options={options}
                value={transferListValue}
                onChange={nextValue => {
                  // Now that busy no longer disables the fieldset, the controls
                  // stay live while a change is in flight; ignore transfers
                  // until it settles so one pending action cannot be stacked.
                  if (state.isBusy) {
                    return;
                  }
                  if (isStaged) {
                    setDraftValue(nextValue);
                  } else {
                    commit([...nextValue]);
                  }
                }}
                selectedLabel={selectedLabel}
                availableLabel={availableLabel}
                hasSearch={hasSearch}
                searchLabel={searchLabel}
                searchPlaceholder={searchPlaceholder}
                isReorderable={isReorderable}
                hasSelectAll={hasSelectAll}
                hasClear={hasClear}
                renderOption={renderOption}
                selectedEmptyText={selectedEmptyText}
                availableEmptyText={availableEmptyText}
                noResultsText={noResultsText}
              />
            </fieldset>
            {isStaged && (
              <HStack gap={2} hAlign="end" padding={3} xstyle={styles.footer}>
                <Button
                  label={cancelLabel}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetDraft();
                    close();
                  }}
                />
                <Button
                  label={applyLabel}
                  variant="primary"
                  size="sm"
                  isDisabled={isDisabled || state.isBusy}
                  isLoading={state.isBusy}
                  onClick={() => {
                    if (!areOrderedValuesEqual(draftValue, value)) {
                      commit([...draftValue]);
                    }
                    close();
                  }}
                />
              </HStack>
            )}
          </div>
        );
      }}
    </ComplexSelector>
  );
}

TransferListSelector.displayName = 'TransferListSelector';
