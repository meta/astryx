// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Resolves ElementDescriptor objects into React elements at runtime.
 * Shared between InteractivePreview (for playground defaults) and
 * PlaygroundPropsTable (for slot element controls).
 */

import {
  cloneElement,
  createElement,
  isValidElement,
  type ComponentType,
} from 'react';
import * as Core from '@astryxdesign/core';
import {externalComponentPreviews} from '../../generated/componentPreviewRegistry';
import type {ElementDescriptor} from '../../generated/componentRegistry';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

export function getComponent(name: string): AnyComponent | null {
  // Resolve by bare name first (canonical post un-prefix
  // migration), falling back to the legacy XDS-prefixed export.
  // Reads are wrapped because a strict module mock throws on undefined keys
  // rather than returning undefined.
  const readExport = (key: string): unknown => {
    try {
      return Core[key as keyof typeof Core];
    } catch {
      return undefined;
    }
  };
  const value =
    readExport(name) ??
    readExport(`XDS${name}`) ??
    externalComponentPreviews[name];
  return typeof value === 'function' ||
    (value != null && typeof value === 'object')
    ? (value as AnyComponent)
    : null;
}

export function isElementDescriptor(v: unknown): v is ElementDescriptor {
  return v != null && typeof v === 'object' && '__element' in v;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v == null || typeof v !== 'object' || isValidElement(v)) {
    return false;
  }
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function withArrayKey(node: unknown, key: number): unknown {
  if (isValidElement(node) && node.key == null) {
    return cloneElement(node, {key});
  }
  return node;
}

export function resolveElementDescriptor(
  desc: ElementDescriptor,
): React.ReactNode {
  const Comp = getComponent(desc.__element.replace(/^XDS/, ''));
  const tag = Comp ?? desc.__element;

  // Resolve nested ElementDescriptors anywhere inside props.
  const resolvedProps: Record<string, unknown> = {};
  if (desc.props) {
    for (const [key, val] of Object.entries(desc.props)) {
      resolvedProps[key] = resolveValue(val);
    }
  }

  const children =
    desc.children == null
      ? undefined
      : (resolveValue(desc.children) as React.ReactNode);

  return createElement(tag, resolvedProps, children);
}

export function resolveValue(v: unknown): unknown {
  if (isElementDescriptor(v)) {
    return resolveElementDescriptor(v);
  }

  if (Array.isArray(v)) {
    return v.map((item, index) => withArrayKey(resolveValue(item), index));
  }

  if (isPlainObject(v)) {
    const resolved: Record<string, unknown> = {};
    let changed = false;
    for (const [key, value] of Object.entries(v)) {
      const next = resolveValue(value);
      resolved[key] = next;
      changed ||= next !== value;
    }
    return changed ? resolved : v;
  }

  return v;
}
