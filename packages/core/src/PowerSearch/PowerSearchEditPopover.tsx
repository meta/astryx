// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file PowerSearchEditPopover.tsx
 * @input InternalConfig, PartialFilter
 * @output Edit popover content with field/operator selectors and value editor;
 *   the built-in NestedEditor the sheet presentation's value step shares
 * @position Sub-component; consumed by PowerSearch
 *
 * SYNC: When modified, update:
 * - /packages/core/src/PowerSearch/index.ts
 */

import React, {useState, useCallback, useEffect, useMemo, useRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '../Button';
import {Selector} from '../Selector';
import {HStack, VStack} from '../Stack';
import {Icon} from '../Icon';
import {TreeList, type TreeListItemData} from '../TreeList';
import {isImeKeyEvent} from '../utils/ime';
import {spacingVars, typeScaleVars} from '../theme/tokens.stylex';
import {
  PowerSearchValueEditor,
  type PowerSearchValueEditorProps,
} from './PowerSearchValueEditor';
import {resolveOperatorLabel} from './resolveOperatorLabel';
import type {InternalConfig} from './useInternalConfig';
import type {
  PowerSearchFilter,
  PartialFilter,
  FilterValue,
  OperatorValue,
  PowerSearchOperator,
} from './types';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/PowerSearch/PowerSearchEditPopover.generated';

registerEnglishFallback(english);

// Below the popover layer's 400px floor (see popoverLayerStyles in
// PowerSearch.tsx) the chip rows collapse from one line to wrapped lines.
// A container query, not a viewport one, so the rows track the width the
// popover actually got (#4761).
const CHIP_ROW_COLLAPSE = '@container (max-width: 399px)';

const styles = stylex.create({
  container: {
    overflow: 'hidden',
    containerType: 'inline-size',
  },
  content: {
    padding: spacingVars['--spacing-4'],
  },
  chipRow: {
    flexWrap: {default: 'nowrap', [CHIP_ROW_COLLAPSE]: 'wrap'},
  },
  footer: {
    padding: spacingVars['--spacing-3'],
    paddingTop: 0,
  },
  fieldSelector: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  operatorSelector: {
    flexGrow: 1,
    flexShrink: 0,
    // Long translated operator labels truncate in the Selector trigger
    // instead of pushing the row wider than the popover (#4761).
    maxWidth: '100%',
  },
  valueEditor: {
    flexGrow: 2,
    minWidth: 0,
  },
  // Nested editor styles
  nestedRootLabel: {
    fontSize: typeScaleVars['--text-label-size'],
  },
  nestedFieldSelector: {
    flexShrink: 0,
    width: 200,
    maxWidth: '100%',
  },
  nestedOperatorSelector: {
    flexShrink: 0,
    width: 180,
    maxWidth: '100%',
  },
  nestedRow: {
    width: '100%',
  },
  nestedRowValueEditor: {
    flexGrow: 2,
    flexShrink: 1,
    minWidth: 0,
  },
});

export interface PowerSearchEditPopoverProps {
  config: InternalConfig;
  /** The filter being edited/created. */
  filter: PartialFilter;
  /** 'create' for new filters, 'edit' for existing. */
  mode: 'create' | 'edit';
  /** Called when save is clicked with a complete filter, or null to delete. */
  onSave: (filter: PowerSearchFilter | null) => void;
  /** Called when the popover is closed without saving. */
  onCancel: () => void;
  /** Label for the save button. @default 'Apply' */
  saveButtonLabel?: string;
  /** Max suggestions in string and entity value typeaheads. */
  maxMenuItems?: number;
  /** Whether the filter is read-only. */
  isReadOnly?: boolean;
}

// =============================================================================
// Editable filter state for recursive nesting
// =============================================================================

interface EditablePartialFilter {
  field: string;
  operator?: string;
  value?: FilterValue;
  _subFilters?: EditablePartialFilter[];
}

function initEditableFilter(
  config: InternalConfig,
  filter: PowerSearchFilter,
): EditablePartialFilter {
  const op = config.getOperator(filter.field, filter.operator);
  if (op?.value.type === 'nested' && filter.value?.type === 'nested') {
    return {
      field: filter.field,
      operator: filter.operator,
      value: filter.value,
      _subFilters: filter.value.value.map(f => initEditableFilter(config, f)),
    };
  }
  return {
    field: filter.field,
    operator: filter.operator,
    value: filter.value,
  };
}

function isEditableFilterComplete(
  config: InternalConfig,
  ef: EditablePartialFilter,
): boolean {
  if (!ef.field || !ef.operator) {
    return false;
  }
  const op = config.getOperator(ef.field, ef.operator);
  if (op?.value.type === 'nested') {
    const subs = ef._subFilters ?? [];
    return (
      subs.length > 0 && subs.every(s => isEditableFilterComplete(config, s))
    );
  }
  return ef.value != null;
}

function editableToCompleteFilter(
  config: InternalConfig,
  ef: EditablePartialFilter,
): PowerSearchFilter | null {
  if (!ef.operator) {
    return null;
  }
  const op = config.getOperator(ef.field, ef.operator);
  if (op?.value.type === 'nested') {
    const subs = (ef._subFilters ?? [])
      .map(s => editableToCompleteFilter(config, s))
      .filter((s): s is PowerSearchFilter => s != null);
    return {
      field: ef.field,
      operator: ef.operator,
      value: {type: 'nested', value: subs},
    };
  }
  if (ef.value == null) {
    return null;
  }
  return {
    field: ef.field,
    operator: ef.operator,
    value: ef.value,
  };
}

function updateAtPath(
  filters: EditablePartialFilter[],
  path: number[],
  updater: (filter: EditablePartialFilter) => EditablePartialFilter,
): EditablePartialFilter[] {
  const [idx, ...rest] = path;
  const next = [...filters];
  if (rest.length === 0) {
    next[idx] = updater(next[idx]);
  } else {
    const sf = next[idx];
    next[idx] = {
      ...sf,
      _subFilters: updateAtPath(sf._subFilters ?? [], rest, updater),
    };
  }
  return next;
}

function removeAtPath(
  filters: EditablePartialFilter[],
  path: number[],
): EditablePartialFilter[] {
  const [idx, ...rest] = path;
  if (rest.length === 0) {
    return filters.filter((_, i) => i !== idx);
  }
  const next = [...filters];
  const sf = next[idx];
  next[idx] = {
    ...sf,
    _subFilters: removeAtPath(sf._subFilters ?? [], rest),
  };
  return next;
}

function addAtPath(
  filters: EditablePartialFilter[],
  parentPath: number[],
  newFilter: EditablePartialFilter,
): EditablePartialFilter[] {
  if (parentPath.length === 0) {
    return [...filters, newFilter];
  }
  const [idx, ...rest] = parentPath;
  const next = [...filters];
  const sf = next[idx];
  next[idx] = {
    ...sf,
    _subFilters: addAtPath(sf._subFilters ?? [], rest, newFilter),
  };
  return next;
}

// =============================================================================
// Nested sub-filter row
// =============================================================================

interface NestedSubFilterRowProps {
  config: InternalConfig;
  subFilter: EditablePartialFilter;
  onChange: (subFilter: EditablePartialFilter) => void;
  maxMenuItems?: number;
  isReadOnly: boolean;
}

function NestedSubFilterRow({
  config,
  subFilter,
  onChange,
  maxMenuItems,
  isReadOnly,
}: NestedSubFilterRowProps) {
  const t = useComponentTranslator();
  const fieldOptions = useMemo(
    () =>
      config.getVisibleFields().map(field => ({
        value: field.key,
        label: field.label,
      })),
    [config],
  );

  const operatorOptions = useMemo(() => {
    const operators = config.getVisibleOperators(subFilter.field);
    return operators.map(op => ({
      value: op.key,
      label: resolveOperatorLabel(op, t),
    }));
  }, [config, subFilter.field, t]);

  const currentOperator = subFilter.operator
    ? config.getOperator(subFilter.field, subFilter.operator)
    : undefined;

  const operatorValue: OperatorValue | undefined = currentOperator?.value;
  const isEmptyType = operatorValue?.type === 'empty';
  const isNestedType = operatorValue?.type === 'nested';

  const handleFieldChange = useCallback(
    (fieldKey: string) => {
      const defaultOp = config.getDefaultOperator(fieldKey);
      const newOp = defaultOp
        ? config.getOperator(fieldKey, defaultOp.key)
        : undefined;
      onChange({
        field: fieldKey,
        operator: defaultOp?.key,
        value: undefined,
        _subFilters: newOp?.value.type === 'nested' ? [] : undefined,
      });
    },
    [config, onChange],
  );

  const handleOperatorChange = useCallback(
    (operatorKey: string) => {
      const newOp = config.getOperator(subFilter.field, operatorKey);
      const oldOp = currentOperator;
      const keepValue = newOp && oldOp && newOp.value.type === oldOp.value.type;
      onChange({
        ...subFilter,
        operator: operatorKey,
        value: keepValue ? subFilter.value : undefined,
        _subFilters:
          newOp?.value.type === 'nested'
            ? (subFilter._subFilters ?? [])
            : undefined,
      });
    },
    [config, subFilter, currentOperator, onChange],
  );

  const handleValueChange = useCallback(
    (value: FilterValue) => {
      onChange({...subFilter, value});
    },
    [subFilter, onChange],
  );

  return (
    <HStack gap={2} vAlign="center" xstyle={styles.chipRow}>
      <div {...stylex.props(styles.nestedFieldSelector)}>
        <Selector
          label={t('@astryx.powersearch.editor.field')}
          isLabelHidden
          options={fieldOptions}
          value={subFilter.field}
          onChange={handleFieldChange}
          isDisabled={isReadOnly}
          size="md"
        />
      </div>
      {operatorOptions.length > 0 && (
        <div {...stylex.props(styles.nestedOperatorSelector)}>
          <Selector
            label={t('@astryx.powersearch.editor.operator')}
            isLabelHidden
            options={operatorOptions}
            value={subFilter.operator}
            onChange={handleOperatorChange}
            isDisabled={isReadOnly}
            size="md"
          />
        </div>
      )}
      {operatorValue && !isEmptyType && !isNestedType && (
        <div {...stylex.props(styles.nestedRowValueEditor)}>
          <PowerSearchValueEditor
            key={valueEditorKey(subFilter)}
            operatorValue={operatorValue}
            filterValue={subFilter.value}
            onChange={handleValueChange}
            config={config}
            maxMenuItems={maxMenuItems}
            isDisabled={isReadOnly}
          />
        </div>
      )}
    </HStack>
  );
}

// =============================================================================
// Nested editor
// =============================================================================

export interface NestedEditorProps {
  config: InternalConfig;
  partialFilter: PartialFilter;
  operatorOptions: {value: string; label: string}[];
  onOperatorChange: (operatorKey: string) => void;
  onPartialFilterChange: (filter: PartialFilter) => void;
  maxMenuItems?: number;
  isReadOnly: boolean;
  /** Styles for the editor's tree root (the sheet makes it a query container). */
  xstyle?: stylex.StyleXStyles;
  /**
   * Whether the tree root offers the group-operator picker when the field has
   * several operators. The popover shows it; the sheet presentation's value
   * step owns the operator choice in its own Operator group and hides it.
   * @default true
   */
  hasRootOperatorPicker?: boolean;
}

/**
 * The built-in editor for a `nested` value: a tree of sub-filters with Add,
 * field/operator/value rows and removal. The popover renders it below its
 * field selector; the sheet presentation's value step renders the same editor
 * in its body, so a `nested` filter is created
 * and edited the same way in both presentations.
 */
export function NestedEditor({
  config,
  partialFilter,
  operatorOptions,
  onOperatorChange,
  onPartialFilterChange,
  maxMenuItems,
  isReadOnly,
  xstyle,
  hasRootOperatorPicker = true,
}: NestedEditorProps) {
  const t = useComponentTranslator();
  const [subFilters, setSubFilters] = useState<EditablePartialFilter[]>(() => {
    if (partialFilter.value && partialFilter.value.type === 'nested') {
      return partialFilter.value.value.map(f => initEditableFilter(config, f));
    }
    return [];
  });

  const syncToParent = useCallback(
    (newSubFilters: EditablePartialFilter[]) => {
      if (
        newSubFilters.length > 0 &&
        newSubFilters.every(sf => isEditableFilterComplete(config, sf))
      ) {
        onPartialFilterChange({
          ...partialFilter,
          value: {
            type: 'nested',
            value: newSubFilters
              .map(sf => editableToCompleteFilter(config, sf))
              .filter((sf): sf is PowerSearchFilter => sf != null),
          },
        });
      } else {
        onPartialFilterChange({
          ...partialFilter,
          value: undefined,
        });
      }
    },
    [config, partialFilter, onPartialFilterChange],
  );

  const handleUpdate = useCallback(
    (path: number[], updated: EditablePartialFilter) => {
      setSubFilters(prev => {
        const next = updateAtPath(prev, path, () => updated);
        syncToParent(next);
        return next;
      });
    },
    [syncToParent],
  );

  const handleRemove = useCallback(
    (path: number[]) => {
      setSubFilters(prev => {
        const next = removeAtPath(prev, path);
        syncToParent(next);
        return next;
      });
    },
    [syncToParent],
  );

  const handleAdd = useCallback(
    (parentPath: number[]) => {
      const fields = config.getVisibleFields();
      const defaultField = fields[0];
      if (!defaultField) {
        return;
      }

      const defaultOp = config.getDefaultOperator(defaultField.key);
      const op = defaultOp
        ? config.getOperator(defaultField.key, defaultOp.key)
        : undefined;

      const newSubFilter: EditablePartialFilter = {
        field: defaultField.key,
        operator: defaultOp?.key,
        value: undefined,
        _subFilters: op?.value.type === 'nested' ? [] : undefined,
      };

      setSubFilters(prev => {
        const next = addAtPath(prev, parentPath, newSubFilter);
        syncToParent(next);
        return next;
      });
    },
    [config, syncToParent],
  );

  function buildTreeItems(
    filters: EditablePartialFilter[],
    parentPath: number[],
  ): TreeListItemData[] {
    const items: TreeListItemData[] = filters.map((sf, idx) => {
      const itemPath = [...parentPath, idx];
      const op = sf.operator
        ? config.getOperator(sf.field, sf.operator)
        : undefined;
      const isNested = op?.value.type === 'nested';

      if (isNested) {
        const children = buildTreeItems(sf._subFilters ?? [], itemPath);

        if (!isReadOnly) {
          children.push({
            id: `${itemPath.join('-')}-add`,
            label: (
              <Button
                label={t('@astryx.powersearch.editor.addFilter')}
                onClick={() => handleAdd(itemPath)}
                variant="ghost"
                size="sm"
              />
            ),
          });
        }

        return {
          id: `filter-${itemPath.join('-')}`,
          label: (
            <NestedSubFilterRow
              config={config}
              subFilter={sf}
              onChange={updated => handleUpdate(itemPath, updated)}
              maxMenuItems={maxMenuItems}
              isReadOnly={isReadOnly}
            />
          ),
          isExpanded: true,
          children,
          endContent: !isReadOnly ? (
            <Button
              label={t('@astryx.powersearch.editor.removeFilter')}
              icon={<Icon icon="close" size="sm" />}
              variant="ghost"
              size="sm"
              onClick={() => handleRemove(itemPath)}
              isIconOnly
            />
          ) : undefined,
        };
      }

      return {
        id: `filter-${itemPath.join('-')}`,
        isExpanded: true,
        label: (
          <NestedSubFilterRow
            config={config}
            subFilter={sf}
            onChange={updated => handleUpdate(itemPath, updated)}
            maxMenuItems={maxMenuItems}
            isReadOnly={isReadOnly}
          />
        ),
        endContent: !isReadOnly ? (
          <Button
            label={t('@astryx.powersearch.editor.removeFilter')}
            icon={<Icon icon="close" size="sm" />}
            variant="ghost"
            size="sm"
            onClick={() => handleRemove(itemPath)}
            isIconOnly
          />
        ) : undefined,
      };
    });

    return items;
  }

  const treeChildren = buildTreeItems(subFilters, []);

  if (!isReadOnly) {
    treeChildren.push({
      id: 'add-filter',
      label: (
        <Button
          label={t('@astryx.powersearch.editor.addFilter')}
          onClick={() => handleAdd([])}
          variant="ghost"
          size="sm"
        />
      ),
    });
  }

  const rootLabel = (
    <div {...stylex.props(styles.nestedRootLabel)}>
      {hasRootOperatorPicker && operatorOptions.length > 1 ? (
        <div {...stylex.props(styles.operatorSelector)}>
          <Selector
            label={t('@astryx.powersearch.editor.groupOperator')}
            isLabelHidden
            options={operatorOptions}
            value={partialFilter.operator}
            onChange={onOperatorChange}
            isDisabled={isReadOnly}
            size="md"
          />
        </div>
      ) : (
        (operatorOptions.find(option => option.value === partialFilter.operator)
          ?.label ??
        operatorOptions[0]?.label ??
        t('@astryx.powersearch.editor.group'))
      )}
    </div>
  );

  const items: TreeListItemData[] = [
    {
      id: 'nested-root',
      label: rootLabel,
      isExpanded: true,
      children: treeChildren,
    },
  ];

  return <TreeList items={items} density="balanced" xstyle={xstyle} />;
}

// =============================================================================
// Value editor cell
// =============================================================================

// A field switch must replace the editor, not update it in place: a reused
// editor keeps its open menu and old results.
function valueEditorKey(filter: {field: string; operator?: string}): string {
  return `${filter.field}\u0000${filter.operator ?? ''}`;
}

// Keyed on field + operator, so this also mounts on a field switch, not just
// when the popover opens; the focus handoff below runs for both.
function ValueEditorCell(props: PowerSearchValueEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = ref.current;
      if (!container) {
        return;
      }
      const focusable = container.querySelector<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={ref} {...stylex.props(styles.valueEditor)}>
      <PowerSearchValueEditor {...props} />
    </div>
  );
}

// =============================================================================
// Main popover
// =============================================================================

export function PowerSearchEditPopover({
  config,
  filter: initialFilter,
  mode,
  onSave,
  onCancel,
  saveButtonLabel: saveButtonLabelFromProps,
  maxMenuItems,
  isReadOnly = false,
}: PowerSearchEditPopoverProps) {
  const t = useComponentTranslator();
  const saveButtonLabel =
    saveButtonLabelFromProps ?? t('@astryx.powersearch.editor.apply');
  const [partialFilter, setPartialFilter] =
    useState<PartialFilter>(initialFilter);

  const currentOperator = partialFilter.operator
    ? config.getOperator(partialFilter.field, partialFilter.operator)
    : undefined;

  // Build field options for the selector
  const fieldOptions = useMemo(
    () =>
      config.getVisibleFields().map(field => ({
        value: field.key,
        label: field.label,
      })),
    [config],
  );

  // Build operator options for the current field
  const operatorOptions = useMemo(() => {
    const operators = config.getVisibleOperators(partialFilter.field);
    return operators.map(op => ({
      value: op.key,
      label: resolveOperatorLabel(op, t),
    }));
  }, [config, partialFilter.field, t]);

  // An "empty" operator takes no value, so choosing one completes the filter:
  // save it from the choice itself, once, rather than reacting to the state.
  // The save is queued as a microtask so it runs after the Selector reporting
  // the choice has finished closing and refocusing its trigger; a parent that
  // closes the editor on save can then move focus without the Selector taking
  // it back onto a node that is about to unmount.
  const saveIfEmptyOperator = useCallback(
    (fieldKey: string, operator: PowerSearchOperator | undefined) => {
      if (fieldKey && operator?.value.type === 'empty') {
        const filter: PowerSearchFilter = {
          field: fieldKey,
          operator: operator.key,
          value: {type: 'empty'},
        };
        queueMicrotask(() => onSave(filter));
      }
    },
    [onSave],
  );

  const handleFieldChange = useCallback(
    (fieldKey: string) => {
      const defaultOp = config.getDefaultOperator(fieldKey);
      setPartialFilter({
        field: fieldKey,
        operator: defaultOp?.key,
        value: undefined,
      });
      // Re-choosing the current field with its current operator changes
      // nothing, so it saves nothing.
      if (
        fieldKey !== partialFilter.field ||
        defaultOp?.key !== partialFilter.operator
      ) {
        saveIfEmptyOperator(fieldKey, defaultOp);
      }
    },
    [config, partialFilter.field, partialFilter.operator, saveIfEmptyOperator],
  );

  const handleOperatorChange = useCallback(
    (operatorKey: string) => {
      const newOp = config.getOperator(partialFilter.field, operatorKey);
      const oldOp = currentOperator;
      const keepValue = newOp && oldOp && newOp.value.type === oldOp.value.type;

      setPartialFilter(prev => ({
        ...prev,
        operator: operatorKey,
        value: keepValue ? prev.value : undefined,
      }));
      // Re-choosing the current operator changes nothing, so it saves nothing.
      if (operatorKey !== partialFilter.operator) {
        saveIfEmptyOperator(partialFilter.field, newOp);
      }
    },
    [
      config,
      partialFilter.field,
      partialFilter.operator,
      currentOperator,
      saveIfEmptyOperator,
    ],
  );

  const handleValueChange = useCallback(
    (value: FilterValue, shouldSave?: boolean) => {
      setPartialFilter(prev => ({...prev, value}));
      // Saved from the handler, not inside the state updater: React may call
      // an updater more than once (StrictMode does), which would save twice.
      const {field, operator} = partialFilter;
      if (shouldSave && field && operator && value) {
        onSave({field, operator, value});
      }
    },
    [partialFilter, onSave],
  );

  const handleSave = useCallback(() => {
    if (partialFilter.field && partialFilter.operator && partialFilter.value) {
      onSave({
        field: partialFilter.field,
        operator: partialFilter.operator,
        value: partialFilter.value,
      });
    }
  }, [partialFilter, onSave]);

  const handleDelete = useCallback(() => {
    onSave(null);
  }, [onSave]);

  const isSaveDisabled = !partialFilter.operator || !partialFilter.value;

  // Handle Enter to save, Escape to cancel
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Don't treat an IME composition-commit Enter as save-to-close --
      // typing a CJK filter value and pressing Enter to confirm the
      // composition would otherwise close the popover mid-composition.
      if (isImeKeyEvent(e.nativeEvent)) {
        return;
      }
      // A focused button owns its Enter: Cancel cancels, Delete deletes, and
      // the date picker's calendar button opens the calendar. Enter in a
      // text or number value field still saves.
      if (e.key === 'Enter' && e.target instanceof HTMLButtonElement) {
        return;
      }
      if (e.key === 'Enter' && !isSaveDisabled && !e.defaultPrevented) {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        onCancel();
      }
    },
    [isSaveDisabled, handleSave, onCancel],
  );

  const operatorValue: OperatorValue | undefined = currentOperator?.value;
  const isEmptyType = operatorValue?.type === 'empty';
  const isNestedType = operatorValue?.type === 'nested';

  const showOperatorSelector = operatorOptions.length > 1 || !isEmptyType;

  // Nested filter editing
  if (isNestedType) {
    return (
      <div {...stylex.props(styles.container)} onKeyDown={handleKeyDown}>
        <div {...stylex.props(styles.content)}>
          <VStack gap={2}>
            <HStack gap={2}>
              <div {...stylex.props(styles.fieldSelector)}>
                <Selector
                  label={t('@astryx.powersearch.editor.field')}
                  isLabelHidden
                  options={fieldOptions}
                  value={partialFilter.field}
                  onChange={handleFieldChange}
                  isDisabled={isReadOnly}
                  size="md"
                />
              </div>
            </HStack>
            <NestedEditor
              config={config}
              partialFilter={partialFilter}
              operatorOptions={operatorOptions}
              onOperatorChange={handleOperatorChange}
              onPartialFilterChange={setPartialFilter}
              maxMenuItems={maxMenuItems}
              isReadOnly={isReadOnly}
            />
          </VStack>
        </div>
        <div {...stylex.props(styles.footer)}>
          <HStack gap={2} hAlign="between">
            {!isReadOnly && mode === 'edit' ? (
              <Button
                label={t('@astryx.powersearch.editor.delete')}
                onClick={handleDelete}
                variant="ghost"
                size="sm"
              />
            ) : (
              <div />
            )}
            <HStack gap={2}>
              <Button
                label={t('@astryx.powersearch.editor.cancel')}
                onClick={onCancel}
                variant="ghost"
                size="sm"
              />
              <Button
                label={saveButtonLabel}
                onClick={handleSave}
                variant="primary"
                size="sm"
                isDisabled={isSaveDisabled}
              />
            </HStack>
          </HStack>
        </div>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.container)} onKeyDown={handleKeyDown}>
      <div {...stylex.props(styles.content)}>
        <HStack gap={2} xstyle={styles.chipRow}>
          <div {...stylex.props(styles.fieldSelector)}>
            <Selector
              label={t('@astryx.powersearch.editor.field')}
              isLabelHidden
              options={fieldOptions}
              value={partialFilter.field}
              onChange={handleFieldChange}
              isDisabled={isReadOnly}
              size="md"
            />
          </div>
          {showOperatorSelector && operatorOptions.length > 0 && (
            <div {...stylex.props(styles.operatorSelector)}>
              <Selector
                label={t('@astryx.powersearch.editor.operator')}
                isLabelHidden
                options={operatorOptions}
                value={partialFilter.operator}
                onChange={handleOperatorChange}
                isDisabled={isReadOnly}
                size="md"
              />
            </div>
          )}
          {operatorValue && !isEmptyType && (
            <ValueEditorCell
              key={valueEditorKey(partialFilter)}
              operatorValue={operatorValue}
              filterValue={partialFilter.value}
              onChange={handleValueChange}
              onEnter={handleSave}
              config={config}
              maxMenuItems={maxMenuItems}
              isDisabled={isReadOnly}
            />
          )}
        </HStack>
      </div>
      {!isEmptyType && (
        <div {...stylex.props(styles.footer)}>
          <HStack gap={2} hAlign="between">
            {!isReadOnly && mode === 'edit' ? (
              <Button
                label={t('@astryx.powersearch.editor.delete')}
                onClick={handleDelete}
                variant="ghost"
                size="sm"
              />
            ) : (
              <div />
            )}
            <HStack gap={2}>
              <Button
                label={t('@astryx.powersearch.editor.cancel')}
                onClick={onCancel}
                variant="ghost"
                size="sm"
              />
              <Button
                label={saveButtonLabel}
                onClick={handleSave}
                variant="primary"
                size="sm"
                isDisabled={isSaveDisabled}
              />
            </HStack>
          </HStack>
        </div>
      )}
    </div>
  );
}
