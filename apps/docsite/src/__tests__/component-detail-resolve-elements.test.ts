// Copyright (c) Meta Platforms, Inc. and affiliates.

import {isValidElement, type ReactElement} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {
  getComponent,
  resolveValue,
} from '../components/component-detail/resolveElements';

vi.mock('@astryxdesign/core', () => ({
  Badge: () => null,
  Card: () => null,
  Grid: () => null,
  HStack: () => null,
  Icon: () => null,
  SideNavItem: () => null,
  Text: () => null,
}));

describe('component detail element resolution', () => {
  it('resolves external components and nested descriptors lazily', () => {
    expect(getComponent('RichTextEditor')).not.toBeNull();
    const tourStep = resolveValue({
      __element: 'TourStep',
      props: {title: 'Review'},
    });
    expect(isValidElement(tourStep)).toBe(true);
    expect((tourStep as ReactElement).type).not.toBe('TourStep');
    expect(
      ((tourStep as ReactElement).type as {displayName?: string}).displayName,
    ).toBe('TourStep');
  });

  it('resolves descriptor arrays from playground defaults into React elements', () => {
    const resolved = resolveValue([
      {__element: 'SideNavItem', props: {label: 'Dashboard'}},
      {__element: 'SideNavItem', props: {label: 'Projects'}},
    ]);

    expect(Array.isArray(resolved)).toBe(true);
    const items = resolved as ReactElement<Record<string, unknown>>[];
    expect(items.every(item => isValidElement(item))).toBe(true);
    expect(items[0].props).toMatchObject({label: 'Dashboard'});
    expect(items[1].props).toMatchObject({label: 'Projects'});
  });

  it('resolves descriptors nested inside plain object props', () => {
    const resolved = resolveValue({
      before: {__element: 'Icon', props: {icon: 'check', size: 'sm'}},
      children: [{__element: 'Badge', props: {label: '3'}}],
    }) as {
      before: ReactElement<Record<string, unknown>>;
      children: ReactElement<Record<string, unknown>>[];
    };

    expect(isValidElement(resolved.before)).toBe(true);
    expect(resolved.before.props).toMatchObject({icon: 'check', size: 'sm'});
    expect(isValidElement(resolved.children[0])).toBe(true);
    expect(resolved.children[0].props).toMatchObject({label: '3'});
  });

  it('resolves descriptor values nested inside status-like object props', () => {
    const resolved = resolveValue({
      status: {
        type: 'error',
        message: {
          __element: 'Text',
          props: {type: 'body'},
          children: 'Bad date',
        },
      },
    }) as {
      status: {type: string; message: ReactElement<Record<string, unknown>>};
    };

    expect(resolved.status.type).toBe('error');
    expect(isValidElement(resolved.status.message)).toBe(true);
    expect(resolved.status.message.props.children).toBe('Bad date');
  });

  it.each([
    ['GridSpan', 'Grid', {columns: 3, gap: 2}],
    ['StackItem', 'HStack', {gap: 2, width: 300}],
  ])(
    "resolves %s's playground.wrapper (%s) to a real component and its props (#5893, #5899)",
    (_subComponent, wrapperName, wrapperProps) => {
      const WrapperComponent = getComponent(wrapperName);
      expect(WrapperComponent).not.toBeNull();
      expect(resolveValue(wrapperProps)).toEqual(wrapperProps);
    },
  );
});
