// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contract/parseDocType.ts
 * @input A prop's type string as a component's .doc.mjs documents it
 * @output A portable PropType, or the reason the type has no portable form
 * @position Reads core documentation into the contract model (AST-082 FR4)
 */

import type {PropSpec, PropType} from './types.js';

export type ParsedType =
  | {readonly ok: true; readonly type: PropType}
  | {
      readonly ok: false;
      readonly reason: string;
      /** True for a callback whose only arguments are DOM events. */
      readonly eventOnly?: boolean;
    };

/** Web-only types, keyed by name, with the reason each has no native form. */
const WEB_ONLY_TYPES: Readonly<Record<string, string>> = {
  ReactNode: 'free-form content; use a typed slot in the core',
  ReactElement: 'free-form content; use a typed slot in the core',
  'JSX.Element': 'free-form content; use a typed slot in the core',
  StyleXStyles: 'web styling input',
  CSSProperties: 'web styling input',
  SizeValue: 'CSS length',
  IconType: 'web icon component; native icons use shared icon names',
  ElementType: 'web element choice',
  ComponentType: 'web component reference',
  LinkComponentType: 'web link component',
  AriaRole: 'web accessibility attribute',
  MouseEvent: 'DOM event',
  FocusEvent: 'DOM event',
  KeyboardEvent: 'DOM event',
  PointerEvent: 'DOM event',
  ChangeEvent: 'DOM event',
  DragEvent: 'DOM event',
  ClipboardEvent: 'DOM event',
  FormEvent: 'DOM event',
  TouchEvent: 'DOM event',
  SyntheticEvent: 'DOM event',
};

/** True for a DOM event type, with or without its element parameter. */
function isDomEvent(text: string): boolean {
  const name = /^(?:React\.)?([A-Z]\w*)(?:<[\s\S]*>)?$/.exec(text.trim())?.[1];
  return name != null && WEB_ONLY_TYPES[name] === 'DOM event';
}

const ok = (type: PropType): ParsedType => ({ok: true, type});
const no = (reason: string): ParsedType => ({ok: false, reason});

/** Splits on a separator at bracket depth zero, ignoring quoted text. */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (text.startsWith('=>', i)) {
      // An arrow is not a closing angle bracket.
      if (depth === 0 && separator === '=>') {
        parts.push(text.slice(start, i));
        start = i + 2;
      }
      i += 1;
    } else if ('([{<'.includes(ch)) {
      depth++;
    } else if (')]}>'.includes(ch)) {
      depth--;
    } else if (depth === 0 && text.startsWith(separator, i)) {
      parts.push(text.slice(start, i));
      start = i + separator.length;
      i += separator.length - 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(part => part.length > 0);
}

/** True when the first `(` closes at the last character, as in `(A | B)`. */
function isWrappedInParens(text: string): boolean {
  if (!text.startsWith('(') || !text.endsWith(')')) {
    return false;
  }
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') {
      depth++;
    } else if (text[i] === ')') {
      depth--;
    }
    if (depth === 0 && i < text.length - 1) {
      return false;
    }
  }
  return true;
}

function stripOuterParens(text: string): string {
  let t = text.trim();
  while (isWrappedInParens(t)) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

function parseRecord(body: string): ParsedType {
  const fields: Record<string, PropSpec> = {};
  for (const member of splitTop(body, ',').flatMap(part =>
    splitTop(part, ';'),
  )) {
    const match = /^([A-Za-z_$][\w$]*)(\?)?\s*:\s*([\s\S]+)$/.exec(member);
    if (!match) {
      return no(`record member "${member}" is not a plain field`);
    }
    const parsed = parseDocType(match[3]);
    if (!parsed.ok) {
      return no(`field "${match[1]}": ${parsed.reason}`);
    }
    fields[match[1]] = {type: parsed.type, optional: match[2] === '?'};
  }
  return ok({kind: 'record', fields});
}

function parseFunction(text: string): ParsedType | null {
  const arrow = splitTop(text, '=>');
  if (arrow.length !== 2 || !arrow[0].startsWith('(')) {
    return null;
  }
  const returns = arrow[1].trim();
  if (returns !== 'void') {
    return no(
      /React|ReactNode|JSX/.test(returns)
        ? 'render function; it returns web UI'
        : 'callback returns a value; only void callbacks are portable today',
    );
  }
  const params = arrow[0].slice(1, -1).trim();
  const types = (params ? splitTop(params, ',') : []).map(param => {
    const match = /^([A-Za-z_$][\w$]*)\??\s*:\s*([\s\S]+)$/.exec(param);
    return match ? match[2] : param;
  });
  // A value callback ends with the DOM event that caused it, as in
  // `(checked: boolean, e: ChangeEvent) => void`. The values are the portable
  // callback; the trailing event is the web's part. A callback that carries
  // only an event stays on the web.
  let end = types.length;
  while (end > 0 && isDomEvent(types[end - 1])) {
    end--;
  }
  if (end === 0 && types.length > 0) {
    return {ok: false, reason: 'callback argument: DOM event', eventOnly: true};
  }
  const args: PropType[] = [];
  for (const type of types.slice(0, end)) {
    const parsed = parseDocType(type);
    if (!parsed.ok) {
      return no(`callback argument: ${parsed.reason}`);
    }
    args.push(parsed.type);
  }
  return ok({kind: 'fn', args});
}

/**
 * Parses a documented type string. Supported portable forms: `string`,
 * `number`, `boolean`, closed string or number unions, arrays, plain object
 * literals, callbacks with portable arguments (a trailing DOM event argument
 * is the web's part), named types, and `string | boolean` (words or a
 * switch). Any other union of different kinds has no Swift or Kotlin form.
 */
export function parseDocType(raw: string): ParsedType {
  const text = stripOuterParens(raw.replace(/\s+/g, ' ').trim());
  if (text === '') {
    return no('no documented type');
  }

  const fn = parseFunction(text);
  if (fn) {
    return fn;
  }

  const members = splitTop(text, '|').filter(
    m => m !== 'undefined' && m !== 'null',
  );
  if (members.length > 1) {
    if (members.every(m => /^'[^']*'$/.test(m))) {
      return ok({kind: 'enum', values: members.map(m => m.slice(1, -1))});
    }
    if (members.every(m => /^-?\d+(?:\.\d+)?$/.test(m))) {
      return ok({kind: 'numberEnum', values: members.map(Number)});
    }
    if (
      members.length === 2 &&
      members.includes('string') &&
      members.includes('boolean')
    ) {
      return ok({kind: 'textOrBoolean'});
    }
    const webOnly = members.find(m => WEB_ONLY_TYPES[m] != null);
    if (webOnly) {
      return no(WEB_ONLY_TYPES[webOnly]);
    }
    return no('a union of different kinds has no Swift or Kotlin form');
  }
  const t = members[0] ?? '';

  if (t === 'string' || t === 'number' || t === 'boolean') {
    return ok({kind: t});
  }
  if (/^'[^']*'$/.test(t)) {
    return ok({kind: 'enum', values: [t.slice(1, -1)]});
  }
  if (WEB_ONLY_TYPES[t] != null) {
    return no(WEB_ONLY_TYPES[t]);
  }
  if (isDomEvent(t)) {
    return no('DOM event');
  }

  const generic = /^(?:Readonly)?Array<([\s\S]+)>$/.exec(t);
  if (t.endsWith('[]') || generic) {
    const inner = parseDocType(generic ? generic[1] : t.slice(0, -2));
    return inner.ok
      ? ok({kind: 'array', of: inner.type})
      : no(`array item: ${inner.reason}`);
  }
  if (t.startsWith('{') && t.endsWith('}')) {
    return parseRecord(t.slice(1, -1));
  }
  if (
    /^(?:React\.)?(?:Ref|RefObject|MutableRefObject)</.test(t) ||
    /^HTML\w*Element$/.test(t)
  ) {
    return no('web element reference');
  }
  if (/^[A-Z][\w$]*$/.test(t)) {
    return ok({kind: 'named', name: t});
  }
  return no(`unsupported type "${t}"`);
}
