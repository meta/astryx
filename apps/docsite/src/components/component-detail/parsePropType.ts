// Copyright (c) Meta Platforms, Inc. and affiliates.

import {getIconRegistry} from '@astryxdesign/core/Icon';

/**
 * @file parsePropType.ts
 * @input Stringified TypeScript prop types from component docs
 * @output Control descriptors, typed default/option coercion helpers, and
 *   type-reference segments for inline definition triggers
 * @position Component detail and playground prop-control generation.
 *
 * Parses a stringified TypeScript prop type into a control descriptor
 * that the playground can render an input for. Literal unions become
 * enum controls, including mixed string-literal + boolean unions. Also
 * splits type strings into type-reference segments so the props table can
 * render each resolved type name as an inline definition trigger (#2682).
 */

export interface ElementOption {
  label: string;
  componentName: string;
}

type InputStatusOption = 'error' | 'warning' | 'success';

export type EnumOptionValue = string | number | boolean;

export interface EnumPropControlDescriptor {
  kind: 'enum';
  options: string[];
  allowEmpty: boolean;
  optionValues?: Record<string, EnumOptionValue>;
}

export type PropControlDescriptor =
  | EnumPropControlDescriptor
  | {kind: 'input-status'; options: InputStatusOption[]; allowEmpty: boolean}
  | {kind: 'theme'}
  | {kind: 'syntax-theme'}
  | {kind: 'boolean'}
  | {kind: 'string'}
  | {kind: 'number'}
  | {kind: 'callback'}
  | {kind: 'element'; options: ElementOption[]}
  | {kind: 'slot-list'; options: ElementOption[]}
  | {kind: 'unknown'};

const STRING_LITERAL_RE = /^['"]([^'"]*)['"]$/;
const NUMBER_LITERAL_RE = /^-?\d+(\.\d+)?$/;
const CALLBACK_RE = /=>/;
const NODE_TYPE_RE = /\b(ReactNode|ReactElement|JSX\.Element|ReactChild)\b/;
const REACT_ELEMENT_RE = /ReactElement<(XDS\w+)Props>/g;

const INPUT_STATUS_OPTIONS: InputStatusOption[] = [
  'error',
  'warning',
  'success',
];

function hasStringLiteral(typeStr: string, value: string): boolean {
  return new RegExp(`['"]${value}['"]`).test(typeStr);
}

function parseStatusOptions(typeStr: string): InputStatusOption[] {
  const literalOptions = INPUT_STATUS_OPTIONS.filter(status =>
    hasStringLiteral(typeStr, status),
  );
  return literalOptions.length > 0 ? literalOptions : INPUT_STATUS_OPTIONS;
}

function isInputStatusType(typeStr: string, propName?: string): boolean {
  if (propName !== 'status') {
    return false;
  }

  // Prefix-agnostic (XDS-prefix migration): match both the legacy
  // prefixed names (XDSInputStatus/XDSFieldStatus) and the bare forms.
  if (/\b(?:XDS)?(?:InputStatus|FieldStatus)\b/.test(typeStr)) {
    return true;
  }

  return (
    typeStr.trim().startsWith('{') &&
    /\btype\s*:/.test(typeStr) &&
    INPUT_STATUS_OPTIONS.some(status => hasStringLiteral(typeStr, status))
  );
}

function splitUnion(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let inString: string | null = null;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];

    if (inString) {
      if (c === inString && input[i - 1] !== '\\') {
        inString = null;
      }
      continue;
    }

    if (c === "'" || c === '"' || c === '`') {
      inString = c;
      continue;
    }

    if (c === '(' || c === '[' || c === '{' || c === '<') {
      depth++;
    } else if (c === ')' || c === ']' || c === '}' || c === '>') {
      depth--;
    } else if (c === '|' && depth === 0) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }

  parts.push(input.slice(start).trim());
  return parts.filter(p => p.length > 0);
}

export function parsePropType(
  typeStr: string,
  propName?: string,
  slotElements?: Array<{__element: string; props?: Record<string, unknown>}>,
): PropControlDescriptor {
  const t = typeStr.trim();
  if (!t) {
    return {kind: 'unknown'};
  }

  // Status objects are edited as typed validation-state objects, not slot
  // elements. Check this before slotElements so a stale/generated descriptor on
  // a status row cannot make the preview pass a React element where components
  // expect {type, message}.
  if (isInputStatusType(t, propName)) {
    return {
      kind: 'input-status',
      options: parseStatusOptions(t),
      allowEmpty: true,
    };
  }

  // If slotElements is declared, use it directly for the element control
  if (slotElements && slotElements.length > 0) {
    // A plain HTML or SVG tag name (lower-case, like `svg`) means nothing to
    // the reader. A single-option switch shows the prop's name instead. With
    // more options, or in a slot list, the labels must stay distinct.
    const isSingleSwitch =
      slotElements.length === 1 && propName != null && propName !== 'children';
    const options = slotElements.map(el => ({
      label:
        isSingleSwitch && /^[a-z]/.test(el.__element)
          ? propName
          : el.__element.replace(/^XDS/, ''),
      componentName: el.__element,
    }));
    // children with slotElements → repeatable slot list (add/remove items)
    if (propName === 'children') {
      return {kind: 'slot-list', options};
    }
    return {kind: 'element', options};
  }

  if (CALLBACK_RE.test(t)) {
    return {kind: 'callback'};
  }

  if (t === 'boolean') {
    return {kind: 'boolean'};
  }
  if (t === 'string') {
    return {kind: 'string'};
  }
  if (t === 'number') {
    return {kind: 'number'};
  }

  if (t === 'SpacingStep') {
    return {
      kind: 'enum',
      options: ['0', '0.5', '1', '1.5', '2', '3', '4', '5', '6', '8', '10'],
      allowEmpty: false,
    };
  }
  if (t === 'SizeValue') {
    return {kind: 'number'};
  }
  if (t === 'DefinedTheme') {
    return {kind: 'theme'};
  }
  if (t === 'SyntaxTheme') {
    return {kind: 'syntax-theme'};
  }
  if (t === 'IconType' || t === 'IconName') {
    return {
      kind: 'enum',
      options: Object.keys(getIconRegistry()),
      allowEmpty: true,
    };
  }
  if (t === 'AppShellBreakpoint') {
    return {
      kind: 'enum',
      options: ['sm', 'md', 'lg', 'none'],
      allowEmpty: false,
    };
  }

  const elementMatches: ElementOption[] = [];
  let m;
  REACT_ELEMENT_RE.lastIndex = 0;
  while ((m = REACT_ELEMENT_RE.exec(t)) !== null) {
    const componentName = m[1];
    elementMatches.push({
      label: componentName.replace(/^XDS/, ''),
      componentName,
    });
  }
  if (elementMatches.length > 0) {
    return {kind: 'element', options: elementMatches};
  }

  if (NODE_TYPE_RE.test(t)) {
    const isIconProp =
      propName != null &&
      /^(icon|startIcon|endIcon|leftIcon|rightIcon)$/i.test(propName);
    if (isIconProp) {
      return {
        kind: 'element',
        options: [{label: 'Icon', componentName: 'Icon'}],
      };
    }
    return {kind: 'string'};
  }

  const parts = splitUnion(t);

  // A union of only the primitives `string`/`number` (e.g. `number | string`,
  // optionally nullable) is editable as free text — accepts e.g. "64px" or 64.
  const nonNullishParts = parts.filter(p => p !== 'null' && p !== 'undefined');
  if (
    nonNullishParts.length > 0 &&
    nonNullishParts.every(p => p === 'string' || p === 'number')
  ) {
    return {kind: 'string'};
  }

  const literals: string[] = [];
  const optionValues: Record<string, EnumOptionValue> = {};
  let allowEmpty = false;
  let onlyLiterals = true;
  let hasNonBooleanLiteral = false;
  let hasOptionValueOverrides = false;

  function addLiteral(value: string): void {
    if (!literals.includes(value)) {
      literals.push(value);
    }
  }

  function addOptionValue(option: string, value: EnumOptionValue): void {
    optionValues[option] = value;
    hasOptionValueOverrides = true;
  }

  for (const part of parts) {
    if (part === 'undefined' || part === 'null') {
      allowEmpty = true;
      continue;
    }
    if (part === 'boolean') {
      addLiteral('true');
      addLiteral('false');
      addOptionValue('true', true);
      addOptionValue('false', false);
      continue;
    }
    const sm = STRING_LITERAL_RE.exec(part);
    if (sm) {
      hasNonBooleanLiteral = true;
      addLiteral(sm[1]);
    } else if (NUMBER_LITERAL_RE.test(part)) {
      hasNonBooleanLiteral = true;
      addLiteral(part);
    } else if (part === 'true' || part === 'false') {
      addLiteral(part);
      addOptionValue(part, part === 'true');
    } else {
      onlyLiterals = false;
      break;
    }
  }

  if (onlyLiterals && literals.length >= 2) {
    if (!hasNonBooleanLiteral) {
      return {kind: 'boolean'};
    }
    return {
      kind: 'enum',
      options: literals,
      allowEmpty,
      ...(hasOptionValueOverrides ? {optionValues} : {}),
    };
  }

  return {kind: 'unknown'};
}

export interface TypeRefSegment {
  text: string;
  isRef: boolean;
}

/**
 * Split a documented prop type string into plain-text and type-reference
 * segments, e.g. `SearchSource<T> | null` with refs `['SearchSource']` →
 * `[{SearchSource, isRef}, {<T> | null}]`. The props table renders each
 * reference segment as an inline trigger that opens the type's definition
 * (see `PropDoc.typeRefs` / `ComponentEntry.typeDefs`); surrounding type
 * syntax stays plain text. Names are matched on word boundaries,
 * longest-first, so overlapping names resolve to the longer one.
 */
export function splitTypeRefSegments(
  typeStr: string,
  names: readonly string[],
): TypeRefSegment[] {
  if (names.length === 0) {
    return [{text: typeStr, isRef: false}];
  }
  const pattern = new RegExp(
    `\\b(${[...names].sort((a, b) => b.length - a.length).join('|')})\\b`,
    'g',
  );
  return typeStr
    .split(pattern)
    .filter(segment => segment !== '')
    .map(segment => ({text: segment, isRef: names.includes(segment)}));
}

export function coerceEnumOption(
  control: EnumPropControlDescriptor,
  option: string,
): EnumOptionValue {
  if (
    control.optionValues != null &&
    Object.prototype.hasOwnProperty.call(control.optionValues, option)
  ) {
    return control.optionValues[option];
  }
  return option;
}

export function coerceDefault(
  raw: string | undefined,
  control: PropControlDescriptor,
): unknown {
  if (raw == null) {
    return undefined;
  }
  const v = raw.trim();
  if (!v) {
    return undefined;
  }

  switch (control.kind) {
    case 'boolean':
      return v === 'true';
    case 'number': {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'enum': {
      const m = STRING_LITERAL_RE.exec(v);
      const stripped = m ? m[1] : v;
      return control.options.includes(stripped)
        ? coerceEnumOption(control, stripped)
        : undefined;
    }
    case 'string': {
      const m = STRING_LITERAL_RE.exec(v);
      return m ? m[1] : v;
    }
    case 'input-status': {
      const m = STRING_LITERAL_RE.exec(v);
      const stripped = m ? m[1] : v;
      return control.options.includes(stripped as InputStatusOption)
        ? {type: stripped, message: `${stripped} status`}
        : undefined;
    }
    case 'element':
      return undefined;
    default:
      return undefined;
  }
}
