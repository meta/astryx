// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PropertyEditor.tsx
 * @input Current editor code + the selected instance + onCodeChange callback
 * @output Literal-bound prop knobs for one component instance + "Apply" footer
 * @position Playground in-preview "Properties" popover (anchored to the selection badge).
 *
 * Parses the code and renders the docs-style props table for the externally
 * selected component instance. Changing a knob performs a targeted source-range
 * edit (see componentInstances) against a local draft; edits are buffered and only
 * written back through onCodeChange when the user clicks "Apply" (pinned at the
 * bottom of the popover, outside the scroll area). Only literal props (boolean /
 * enum / string / number) are editable; enum controls preserve typed option
 * values for mixed literal unions. Props set to an expression are shown
 * read-only ("set in code") to avoid clobbering.
 */

'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Layout, LayoutContent, LayoutFooter} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Selector} from '@astryxdesign/core/Selector';
import {Switch} from '@astryxdesign/core/Switch';
import {TextInput} from '@astryxdesign/core/TextInput';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {List, ListItem} from '@astryxdesign/core/List';
import {Center} from '@astryxdesign/core/Center';
import {Button} from '@astryxdesign/core/Button';
import {
  coerceDefault,
  coerceEnumOption,
  parsePropType,
} from '../../../components/component-detail/parsePropType';
import type {PropDoc} from '../../../generated/componentRegistry';
import {
  analyzeCode,
  formatAttr,
  removeAttribute,
  setAttribute,
  type InstanceInfo,
} from './componentInstances';
import {isEditable, isSupportedProp} from './isSupportedProp';
import {getComponentByModule} from './componentLookup';
import {useLiveNumberInput} from '@/lib/useLiveNumberInput';

const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

const s = stylex.create({
  // Cap the scrollable content area. The popover itself is unbounded, so the
  // footer always sits directly below the content, outside the scroll region.
  contentScroll: {
    maxHeight: 360,
  },
  applyBtn: {
    width: '100%',
  },
  inputControl: {
    width: 160,
  },
  emptyWrap: {
    flex: 1,
    padding: 'var(--spacing-6)',
  },
});

interface PropRowProps {
  prop: PropDoc;
  instance: InstanceInfo;
  code: string;
  onCodeChange: (code: string) => void;
}

function LiveNumberControl({
  label,
  value,
  isRequired,
  onChange,
}: {
  label: string;
  value: number | null;
  isRequired: boolean;
  onChange: (value: number | null) => void;
}) {
  const liveNumber = useLiveNumberInput(value, onChange);
  return (
    <NumberInput
      label={label}
      isLabelHidden
      value={liveNumber.value}
      placeholder={isRequired ? undefined : 'unset'}
      hasClear={!isRequired}
      onChange={liveNumber.handleChange}
      onFocus={liveNumber.handleFocus}
      onInput={liveNumber.handleInput}
      onBlur={liveNumber.handleBlur}
      onKeyDown={liveNumber.handleKeyDown}
      controlXstyle={s.inputControl}
    />
  );
}

function PropRow({prop, instance, code, onCodeChange}: PropRowProps) {
  const control = useMemo(
    () => parsePropType(prop.type, prop.name, prop.slotElements),
    [prop],
  );
  const attr = instance.attrs.find(a => a.name === prop.name);
  const editable = isEditable(control, attr);

  const commit = (
    kind: 'boolean' | 'string' | 'number' | 'enum',
    value: string | number | boolean | null,
  ) => {
    let next: string;
    if (kind === 'boolean') {
      next = value
        ? setAttribute(
            code,
            instance,
            prop.name,
            formatAttr(prop.name, 'boolean', true),
          )
        : removeAttribute(code, instance, prop.name);
    } else if (kind === 'string') {
      next =
        value === ''
          ? removeAttribute(code, instance, prop.name)
          : setAttribute(
              code,
              instance,
              prop.name,
              formatAttr(prop.name, 'string', String(value)),
            );
    } else if (kind === 'number') {
      // A cleared number returns the prop to unset rather than writing a
      // literal (e.g. maxWidth={0}, which collapses sizing props).
      next =
        value == null
          ? removeAttribute(code, instance, prop.name)
          : setAttribute(
              code,
              instance,
              prop.name,
              formatAttr(prop.name, 'number', value),
            );
    } else {
      // Enum commits always carry a concrete option value; treat a null (only
      // emitted by the number control) as clearing the attribute.
      if (value == null) {
        next = removeAttribute(code, instance, prop.name);
      } else {
        const numeric =
          typeof value === 'number' || NUMERIC_RE.test(String(value));
        const attrKind =
          typeof value === 'boolean'
            ? 'boolean'
            : numeric
              ? 'number'
              : 'string';
        next = setAttribute(
          code,
          instance,
          prop.name,
          formatAttr(
            prop.name,
            attrKind,
            numeric && typeof value !== 'number' ? Number(value) : value,
          ),
        );
      }
    }
    onCodeChange(next);
  };

  let controlEl: React.ReactNode;
  if (!editable) {
    controlEl = (
      <Text type="supporting" color={attr ? 'secondary' : 'disabled'}>
        {attr ? 'set in code' : '—'}
      </Text>
    );
  } else if (control.kind === 'boolean') {
    const checked = attr
      ? attr.value === true
      : coerceDefault(prop.default, control) === true;
    controlEl = (
      <Switch
        label={prop.name}
        isLabelHidden
        value={!!checked}
        onChange={next => commit('boolean', next)}
      />
    );
  } else if (control.kind === 'enum') {
    const def = coerceDefault(prop.default, control) as string | undefined;
    const value = String(attr?.value ?? def ?? control.options[0]);
    controlEl = (
      <Selector
        label={prop.name}
        isLabelHidden
        size="sm"
        value={value}
        options={control.options}
        onChange={next => commit('enum', coerceEnumOption(control, next))}
        controlXstyle={s.inputControl}
      />
    );
  } else if (control.kind === 'string') {
    const value = typeof attr?.value === 'string' ? attr.value : '';
    controlEl = (
      <TextInput
        label={prop.name}
        isLabelHidden
        placeholder="value"
        value={value}
        onChange={next => commit('string', next)}
        controlXstyle={s.inputControl}
      />
    );
  } else {
    const def = coerceDefault(prop.default, control) as number | undefined;
    // Reflect the actual source state: a prop that isn't set in code (and has
    // no default) is unset, not `0`. Showing a real `0` here would let a size
    // prop like maxWidth render `max-width: 0` with no way back to unset.
    const value = typeof attr?.value === 'number' ? attr.value : (def ?? null);
    controlEl = (
      <LiveNumberControl
        label={prop.name}
        value={value}
        isRequired={!!prop.required}
        onChange={next => commit('number', next)}
      />
    );
  }

  return (
    <ListItem
      label={
        <Text type="body" weight="bold">
          {prop.name}
        </Text>
      }
      endContent={controlEl}
    />
  );
}

interface ExternalSelection {
  component: string;
  instanceIndex: number;
}

interface PropertyEditorProps {
  code: string;
  onCodeChange: (code: string) => void;
  /** The component instance to edit (chosen via the in-preview selection). */
  externalSelection: ExternalSelection;
  /** Called after edits are flushed via "Apply" (e.g. to close the popover). */
  onApplied?: () => void;
}

export function PropertyEditor({
  code,
  onCodeChange,
  externalSelection,
  onApplied,
}: PropertyEditorProps) {
  const {component: selected, instanceIndex} = externalSelection;
  const lastInstances = useRef<InstanceInfo[]>([]);

  // Buffer prop edits locally; knobs mutate the draft and only take effect when
  // the user clicks "Apply". Re-sync whenever the upstream source changes (after
  // an Apply round-trips, or when the code is edited elsewhere).
  const [draft, setDraft] = useState(code);
  useEffect(() => {
    setDraft(code);
  }, [code]);
  const isDirty = draft !== code;
  const applyChanges = () => {
    if (isDirty) {
      onCodeChange(draft);
    }
    onApplied?.();
  };

  // Re-parse the draft on every change; keep the last good parse on syntax
  // errors.
  const instances = useMemo(() => {
    const parsed = analyzeCode(draft);
    if (parsed != null) {
      lastInstances.current = parsed;
      return parsed;
    }
    return lastInstances.current;
  }, [draft]);

  const componentInstances = useMemo(
    () => instances.filter(i => i.component === selected),
    [instances, selected],
  );

  if (instances.length === 0) {
    return (
      <Center xstyle={s.emptyWrap}>
        <EmptyState
          title="No components detected"
          description="Add a component in the Code tab to view properties."
          isCompact
        />
      </Center>
    );
  }

  const entry = getComponentByModule(selected);
  const targetInstance =
    componentInstances[Math.min(instanceIndex, componentInstances.length - 1)];
  const props = entry?.props ?? [];
  const editableProps = props.filter(isSupportedProp);
  const required = editableProps.filter(p => p.required);
  const optional = editableProps.filter(p => !p.required);

  let body: React.ReactNode;
  if (!entry) {
    body = (
      <Text type="supporting" color="secondary">
        {selected} is not part of @astryxdesign/core — no editable props.
      </Text>
    );
  } else if (editableProps.length === 0) {
    body = (
      <Text type="supporting" color="secondary">
        {entry.displayName} has no editable props.
      </Text>
    );
  } else if (targetInstance == null) {
    body = null;
  } else {
    body = (
      <List>
        {[...required, ...optional].map(prop => (
          <PropRow
            key={prop.name}
            prop={prop}
            instance={targetInstance}
            code={draft}
            onCodeChange={setDraft}
          />
        ))}
      </List>
    );
  }

  return (
    <Layout
      height="auto"
      content={
        <LayoutContent padding={3} xstyle={s.contentScroll}>
          {body}
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider padding={3}>
          <Button
            label="Apply"
            variant="primary"
            isDisabled={!isDirty}
            onClick={applyChanges}
            xstyle={s.applyBtn}
          />
        </LayoutFooter>
      }
    />
  );
}
