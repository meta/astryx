// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Dialog.missingOpenChange.test.tsx
 * @input Dialog, AlertDialog, Drawer, BottomSheet and Lightbox rendered open
 *   with `onClose` instead of `onOpenChange`, then closed with Escape
 * @output In development, the close names the component, the prop and the
 *   fix. In production, the components behave as they did before, and their
 *   bundles carry no check or message.
 * @position Tests; the dialog family's required-callback errors
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render} from '@testing-library/react';
import type {ComponentType, ReactNode} from 'react';
import {bundleCoreExport} from '../utils/__tests__/devBundle';

type Loose = ComponentType<Record<string, unknown> & {children?: ReactNode}>;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

const CASES: {
  name: string;
  module: string;
  what: string;
  load: () => Promise<Loose>;
  props: Record<string, unknown>;
}[] = [
  {
    name: 'Dialog',
    module: 'Dialog/Dialog',
    what: 'dialog',
    load: async () => (await import('./Dialog')).Dialog as unknown as Loose,
    props: {'aria-label': 'Settings', children: 'Body'},
  },
  {
    name: 'AlertDialog',
    module: 'AlertDialog/AlertDialog',
    what: 'alert dialog',
    load: async () =>
      (await import('../AlertDialog/AlertDialog'))
        .AlertDialog as unknown as Loose,
    props: {title: 'Delete?', actionLabel: 'Delete', onAction: () => {}},
  },
  {
    name: 'Drawer',
    module: 'Drawer/Drawer',
    what: 'drawer',
    load: async () =>
      (await import('../Drawer/Drawer')).Drawer as unknown as Loose,
    props: {label: 'Details', children: 'Body'},
  },
  {
    name: 'BottomSheet',
    module: 'BottomSheet/BottomSheet',
    what: 'bottom sheet',
    load: async () =>
      (await import('../BottomSheet/BottomSheet'))
        .BottomSheet as unknown as Loose,
    props: {label: 'Options', children: 'Body'},
  },
  {
    name: 'Lightbox',
    module: 'Lightbox/Lightbox',
    what: 'lightbox',
    load: async () =>
      (await import('../Lightbox/Lightbox')).Lightbox as unknown as Loose,
    props: {media: [{type: 'image', src: '/a.png', alt: 'A'}]},
  },
];

/** Messages of the errors that closing the open layer with Escape raises. */
async function errorsOnEscape(Component: Loose, props: object) {
  const errors: string[] = [];
  const onError = (event: ErrorEvent) => {
    event.preventDefault();
    errors.push(String(event.error?.message ?? event.message));
  };
  window.addEventListener('error', onError);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(<Component {...props} isOpen onClose={() => {}} />);
    await act(async () => {});
    const target =
      document.querySelector('[role="dialog"], [role="alertdialog"]') ??
      document.body;
    try {
      fireEvent.keyDown(target, {key: 'Escape'});
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  } finally {
    window.removeEventListener('error', onError);
  }
  return errors;
}

describe.each(CASES)(
  '$name with onClose',
  ({name, module, what, load, props}) => {
    it('names the prop and the fix when it closes', async () => {
      const errors = await errorsOnEscape(await load(), props);
      expect(errors).toContain(
        `${name}: \`onOpenChange\` is required to close the ${what}, for example onOpenChange={setIsOpen}. ${name} has no onClose prop.`,
      );
    });

    it('keeps the production behavior', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.resetModules();
      const errors = await errorsOnEscape(await load(), props);
      expect(errors.join('\n')).not.toContain('has no onClose prop');
      expect(errors.join('\n')).toMatch(/is not a function/);
    });

    it('keeps the message in a development bundle only', () => {
      const phrase = `${name} has no onClose prop`;
      expect(bundleCoreExport(module, name, 'development')).toContain(phrase);
      expect(bundleCoreExport(module, name, 'production')).not.toContain(
        phrase,
      );
    });
  },
);
