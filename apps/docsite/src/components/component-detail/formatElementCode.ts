// Copyright (c) Meta Platforms, Inc. and affiliates.

import {isValidElement, type ReactElement} from 'react';

/**
 * @file formatElementCode.ts
 * @input A React element resolved from a playground slot descriptor
 * @output One line of JSX source for the element, its props and children
 * @position Component detail playground, "Show code" panel.
 *
 * Children print inside the element, so a slot element such as an SVG keeps
 * its `<path>`. An element without children self-closes. A prop whose value
 * is an element prints as JSX.
 */

type AnyElement = ReactElement<Record<string, unknown>>;

function elementTypeName(el: AnyElement): string {
  if (typeof el.type === 'string') {
    return el.type;
  }
  const type = el.type as {displayName?: string; name?: string};
  return type.displayName ?? type.name ?? 'Component';
}

function formatJsxProp([key, value]: [string, unknown]): string {
  if (typeof value === 'string') {
    return `${key}="${value}"`;
  }
  if (isValidElement(value)) {
    return `${key}={${formatElementCode(value)}}`;
  }
  try {
    return `${key}={${JSON.stringify(value)}}`;
  } catch {
    return `${key}={/* ... */}`;
  }
}

function escapeJsxText(text: string): string {
  return text.replace(/[{}<>]/g, ch => `{'${ch}'}`);
}

function formatChildren(children: unknown): string {
  if (children == null || typeof children === 'boolean') {
    return '';
  }
  if (Array.isArray(children)) {
    return children.map(formatChildren).join('');
  }
  if (isValidElement(children)) {
    return formatElementCode(children);
  }
  if (typeof children === 'string' || typeof children === 'number') {
    return escapeJsxText(String(children));
  }
  return '{/* ... */}';
}

export function formatElementCode(element: ReactElement): string {
  const el = element as AnyElement;
  const type = elementTypeName(el);
  const {children, ...rest} = el.props ?? {};
  const propStr = Object.entries(rest).map(formatJsxProp).join(' ');
  const open = propStr === '' ? `<${type}` : `<${type} ${propStr}`;
  const inner = formatChildren(children);
  return inner === '' ? `${open} />` : `${open}>${inner}</${type}>`;
}
