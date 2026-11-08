// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PlaygroundPropsTable.tsx
 * @input Prop docs, control descriptors, current playground values
 * @output Props table rows with inline controls that write typed prop values
 * @position Component detail page — props table and interactive preview knobs.
 */

'use client';

import {createElement, useState} from 'react';
import {Heading, Text} from '@astryxdesign/core/Text';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Divider} from '@astryxdesign/core';
import {Switch} from '@astryxdesign/core/Switch';
import {TextInput} from '@astryxdesign/core/TextInput';
import {NumberInput} from '@astryxdesign/core/NumberInput';
import {Selector} from '@astryxdesign/core/Selector';
import {Icon} from '@astryxdesign/core/Icon';
import {Badge} from '@astryxdesign/core/Badge';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Minus, Plus} from 'lucide-react';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {allSyntaxPresets} from '@astryxdesign/core/theme/syntax';
import {themeObjectsFull} from '../../generated/themeRegistry';
import {coerceEnumOption, type PropControlDescriptor} from './parsePropType';
import {resolveTypeRefs, TypeRefText} from './TypeRefText';
import type {KnobProp} from './InteractivePreview';
import {resolveElementDescriptor} from './resolveElements';
import type {
  ElementDescriptor,
  PropDoc,
  TypeDefinition,
} from '../../generated/componentRegistry';
import {MarkdownText} from '../MarkdownText';
import {useLiveNumberInput} from '@/lib/useLiveNumberInput';

function formatType(type: string, defaultValue?: string): React.ReactNode {
  const parts = type.split(/\s*\|\s*/);
  const isEnum = parts.length > 1 && parts.every(p => /^['"]/.test(p.trim()));
  if (isEnum) {
    return (
      <>
        {parts.map((part, i) => {
          const trimmed = part.trim();
          const isDefault = defaultValue != null && trimmed === defaultValue;
          return (
            <span key={i}>
              {'| '}
              {isDefault ? <b>{trimmed}</b> : trimmed}
              {isDefault && ' (default)'}
              {i < parts.length - 1 && <br />}
            </span>
          );
        })}
      </>
    );
  }
  if (defaultValue != null) {
    return (
      <>
        {type} <span style={{opacity: 0.6}}>(default: {defaultValue})</span>
      </>
    );
  }
  return type;
}

/**
 * Type-column text for a prop. When the documented type references named
 * types exported from the component's package (e.g. `SearchSource<T>`), each
 * referenced name becomes an inline definition trigger; surrounding type
 * syntax (generics punctuation, unions) stays plain text. Props with no
 * resolved references keep the plain formatType rendering.
 */
function PropTypeText({
  prop,
  typeDefs,
}: {
  prop: PropDoc;
  typeDefs: TypeDefinition[];
}) {
  const defs = resolveTypeRefs(prop.typeRefs, typeDefs);
  if (defs.length === 0) {
    return <>{formatType(prop.type, prop.default)}</>;
  }

  return (
    <>
      <TypeRefText type={prop.type} defs={defs} />
      {prop.default != null && (
        <span style={{opacity: 0.6}}> (default: {prop.default})</span>
      )}
    </>
  );
}

function resolveSlotElement(
  componentName: string,
  slotElements?: Array<{
    __element: string;
    props?: Record<string, unknown>;
    children?: unknown;
  }>,
): React.ReactNode {
  if (slotElements) {
    const match = slotElements.find(el => el.__element === componentName);
    if (match) {
      return resolveElementDescriptor(match as ElementDescriptor);
    }
  }
  // Fallback for common components without slotElements declared
  switch (componentName) {
    case 'Icon':
      return createElement(Icon, {icon: 'check', size: 'sm'});
    case 'Badge':
      return createElement(Badge, {label: 'Badge'});
    default:
      return null;
  }
}

type InputStatusOption = 'error' | 'warning' | 'success';

const STATUS_OPTION_LABELS: Record<InputStatusOption, string> = {
  error: 'Error',
  warning: 'Warning',
  success: 'Success',
};

function createStatusValue(type: InputStatusOption) {
  return {
    type,
    message: `${STATUS_OPTION_LABELS[type]} status message`,
  };
}

function getStatusValue(value: unknown): InputStatusOption | 'None' {
  if (
    value != null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof value.type === 'string' &&
    value.type in STATUS_OPTION_LABELS
  ) {
    return value.type as InputStatusOption;
  }

  return 'None';
}

function humanizePackageName(pkgName: string): string {
  return pkgName
    .replace('@astryxdesign/theme-', '')
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const themeOptions = Object.entries(themeObjectsFull).map(
  ([pkgName, theme]) => ({
    value: pkgName,
    label: humanizePackageName(pkgName),
    theme,
  }),
);

const syntaxThemeOptions = allSyntaxPresets.map(theme => ({
  value: theme.name,
  label: theme.name
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' '),
  theme,
}));

function ThemeControl({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  if (themeOptions.length === 0) {
    return null;
  }

  const selected =
    themeOptions.find(
      option =>
        option.theme === value ||
        (value != null &&
          typeof value === 'object' &&
          'name' in value &&
          option.theme.name === value.name),
    )?.value ?? themeOptions[0].value;

  return (
    <Selector
      label="Theme"
      isLabelHidden
      value={selected}
      options={themeOptions.map(({value: optionValue, label}) => ({
        value: optionValue,
        label,
      }))}
      onChange={next => {
        const match = themeOptions.find(option => option.value === next);
        if (match) {
          onChange(match.theme);
        }
      }}
    />
  );
}

function SyntaxThemeControl({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const selected =
    syntaxThemeOptions.find(
      option =>
        option.theme === value ||
        (value != null &&
          typeof value === 'object' &&
          'name' in value &&
          option.theme.name === value.name),
    )?.value ?? syntaxThemeOptions[0].value;

  return (
    <Selector
      label="Syntax theme"
      isLabelHidden
      value={selected}
      options={syntaxThemeOptions.map(({value: optionValue, label}) => ({
        value: optionValue,
        label,
      }))}
      onChange={next => {
        const match = syntaxThemeOptions.find(option => option.value === next);
        if (match) {
          onChange(match.theme);
        }
      }}
    />
  );
}

function ElementControl({
  control,
  value,
  onChange,
  prop,
}: {
  control: Extract<PropControlDescriptor, {kind: 'element'}>;
  value: unknown;
  onChange: (next: unknown) => void;
  prop: PropDoc;
}) {
  const [selected, setSelected] = useState<string>('None');

  if (control.options.length === 1) {
    const opt = control.options[0];
    return (
      <Switch
        label={opt.label}
        value={value != null}
        onChange={on =>
          onChange(
            on
              ? resolveSlotElement(opt.componentName, prop.slotElements)
              : undefined,
          )
        }
      />
    );
  }

  return (
    <Selector
      label={prop.name}
      isLabelHidden
      placeholder="None"
      value={value != null ? selected : 'None'}
      options={['None', ...control.options.map(o => o.label)]}
      onChange={next => {
        setSelected(next);
        if (next === 'None' || next === '') {
          onChange(undefined);
        } else {
          const opt = control.options.find(o => o.label === next);
          if (opt) {
            onChange(resolveSlotElement(opt.componentName, prop.slotElements));
          }
        }
      }}
    />
  );
}

function SlotListControl({
  control,
  value,
  onChange,
  prop,
}: {
  control: Extract<PropControlDescriptor, {kind: 'slot-list'}>;
  value: unknown;
  onChange: (next: unknown) => void;
  prop: PropDoc;
}) {
  const items = Array.isArray(value) ? value : [];
  const count = items.length;

  const addItem = () => {
    const slotEl = prop.slotElements?.[0];
    if (!slotEl) {
      return;
    }
    const n = count + 1;
    const tweaked = {...slotEl};
    const props = {...(tweaked.props ?? {})};
    if (typeof props.label === 'string') {
      props.label = `${props.label} ${n}`;
    }
    if (typeof props.value === 'string') {
      props.value = `${props.value}-${n}`;
    }
    tweaked.props = props;
    const children =
      typeof tweaked.children === 'string'
        ? `${tweaked.children} ${n}`
        : tweaked.children;
    const descriptor: ElementDescriptor = {
      ...tweaked,
      children,
    };
    const newEl = resolveElementDescriptor(descriptor);
    onChange([...items, newEl]);
  };

  const removeItem = () => {
    if (count > 0) {
      onChange(items.slice(0, -1));
    }
  };

  return (
    <HStack gap={2} vAlign="center">
      <Text type="supporting" color="secondary">
        {count} {control.options[0].label}
        {count !== 1 ? 's' : ''}
      </Text>
      <HStack gap={1}>
        <IconButton
          label="Remove item"
          tooltip="Remove item"
          icon={<Minus size={16} />}
          variant="ghost"
          size="sm"
          isDisabled={count === 0}
          onClick={removeItem}
        />
        <IconButton
          label="Add item"
          tooltip="Add item"
          icon={<Plus size={16} />}
          variant="ghost"
          size="sm"
          onClick={addItem}
        />
      </HStack>
    </HStack>
  );
}

function NumberControl({
  value,
  isRequired,
  onChange,
}: {
  value: number | null;
  isRequired: boolean;
  onChange: (value: number | null) => void;
}) {
  const liveNumber = useLiveNumberInput(value, onChange);
  return (
    <NumberInput
      label=""
      value={liveNumber.value}
      placeholder={isRequired ? undefined : 'unset'}
      hasClear={!isRequired}
      onChange={liveNumber.handleChange}
      onFocus={liveNumber.handleFocus}
      onInput={liveNumber.handleInput}
      onBlur={liveNumber.handleBlur}
      onKeyDown={liveNumber.handleKeyDown}
    />
  );
}

function InlineControl({
  control,
  value,
  onChange,
  prop,
}: {
  control: PropControlDescriptor;
  value: unknown;
  onChange: (next: unknown) => void;
  prop: PropDoc;
}) {
  switch (control.kind) {
    case 'boolean':
      return (
        <Switch
          label=""
          value={value === true}
          onChange={next => onChange(next)}
        />
      );
    case 'enum': {
      const isNumeric = control.options.every(o => /^-?\d+(\.\d+)?$/.test(o));
      const options = control.allowEmpty
        ? ['None', ...control.options]
        : control.options;
      const selected =
        value == null && control.allowEmpty
          ? 'None'
          : String(value ?? control.options[0]);
      return (
        <Selector
          label={prop.name}
          isLabelHidden
          value={selected}
          options={options}
          onChange={next => {
            if (control.allowEmpty && (next === 'None' || next === '')) {
              onChange(undefined);
              return;
            }
            onChange(
              isNumeric ? Number(next) : coerceEnumOption(control, next),
            );
          }}
        />
      );
    }
    case 'input-status': {
      const selected = getStatusValue(value);
      const options = control.allowEmpty
        ? ['None', ...control.options]
        : control.options;
      return (
        <Selector
          label={prop.name}
          isLabelHidden
          value={selected}
          options={options}
          onChange={next =>
            onChange(
              next === 'None' || next === ''
                ? undefined
                : createStatusValue(next as InputStatusOption),
            )
          }
        />
      );
    }
    case 'theme':
      return <ThemeControl value={value} onChange={onChange} />;
    case 'syntax-theme':
      return <SyntaxThemeControl value={value} onChange={onChange} />;
    case 'string':
      return (
        <TextInput
          label=""
          placeholder="value"
          value={typeof value === 'string' ? value : ''}
          onChange={next => onChange(next)}
        />
      );
    case 'number':
      // An optional prop with no default is genuinely unset — show an empty
      // input (not a fabricated `0`, which misrepresents the live state and,
      // for size props like maxWidth, has no path back to "unset"). `hasClear`
      // lets the user return to the original unset render. Required numbers
      // keep their generated fallback and stay non-clearable.
      return (
        <NumberControl
          value={typeof value === 'number' ? value : null}
          isRequired={!!prop.required}
          onChange={next => onChange(next ?? undefined)}
        />
      );
    case 'element':
      return (
        <ElementControl
          control={control}
          value={value}
          onChange={onChange}
          prop={prop}
        />
      );
    case 'slot-list':
      return (
        <SlotListControl
          control={control}
          value={value}
          onChange={onChange}
          prop={prop}
        />
      );
    default:
      return null;
  }
}

function PropRow({
  prop,
  typeDefs,
  knob,
  value,
  onChange,
  isMobile,
}: {
  prop: PropDoc;
  typeDefs: TypeDefinition[];
  knob?: KnobProp;
  value?: unknown;
  onChange?: (next: unknown) => void;
  isMobile: boolean;
}) {
  if (isMobile) {
    return (
      <VStack gap={2} style={{paddingBlock: 8}}>
        <Text type="body" weight="bold">
          {prop.name}
        </Text>
        <Text type="code" display="block">
          <PropTypeText prop={prop} typeDefs={typeDefs} />
        </Text>
        {prop.description != null && prop.description !== '' && (
          <MarkdownText type="body" color="secondary">
            {prop.description}
          </MarkdownText>
        )}
        {knob && onChange && (
          <InlineControl
            control={knob.control}
            value={value}
            onChange={onChange}
            prop={prop}
          />
        )}
      </VStack>
    );
  }

  return (
    <HStack gap={3} style={{paddingBlock: 6}}>
      <div style={{flexBasis: 200, flexShrink: 0}}>
        <Text type="body" weight="bold">
          {prop.name}
        </Text>
      </div>
      <div style={{flex: 1}}>
        <Text type="code" display="block">
          <PropTypeText prop={prop} typeDefs={typeDefs} />
        </Text>
        {prop.description != null && prop.description !== '' && (
          <MarkdownText type="body" color="secondary" style={{marginTop: 6}}>
            {prop.description}
          </MarkdownText>
        )}
      </div>
      {knob && onChange && (
        <div style={{flexBasis: 200, flexShrink: 0}}>
          <InlineControl
            control={knob.control}
            value={value}
            onChange={onChange}
            prop={prop}
          />
        </div>
      )}
    </HStack>
  );
}

interface PlaygroundPropsTableProps {
  props: PropDoc[];
  typeDefs: TypeDefinition[];
  knobs: KnobProp[];
  state: Record<string, unknown>;
  onPropChange: (name: string, value: unknown) => void;
}

export function PlaygroundPropsTable({
  props,
  typeDefs,
  knobs,
  state,
  onPropChange,
}: PlaygroundPropsTableProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const required = props.filter(p => p.required);
  const optional = props.filter(p => !p.required);

  const knobMap = new Map(knobs.map(k => [k.row.name, k]));

  return (
    <>
      {required.length > 0 && (
        <>
          <Heading level={4} color="secondary">
            Required
          </Heading>
          {required
            .toSorted((a, b) => a.name.localeCompare(b.name))
            .map(prop => (
              <div key={prop.name}>
                <Divider />
                <PropRow
                  prop={prop}
                  typeDefs={typeDefs}
                  knob={knobMap.get(prop.name)}
                  value={state[prop.name]}
                  onChange={next => onPropChange(prop.name, next)}
                  isMobile={isMobile}
                />
              </div>
            ))}
        </>
      )}
      {optional.length > 0 && (
        <>
          <Heading level={4} color="secondary" style={{marginTop: 8}}>
            Optional
          </Heading>
          {optional
            .toSorted((a, b) => a.name.localeCompare(b.name))
            .map(prop => (
              <div key={prop.name}>
                <Divider />
                <PropRow
                  prop={prop}
                  typeDefs={typeDefs}
                  knob={knobMap.get(prop.name)}
                  value={state[prop.name]}
                  onChange={next => onPropChange(prop.name, next)}
                  isMobile={isMobile}
                />
              </div>
            ))}
        </>
      )}
    </>
  );
}
