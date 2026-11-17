// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenuSubMenuRow.test.tsx
 * @input Uses vitest, @testing-library/react, @testing-library/user-event
 * @output Unit tests for a data item's sub-menu row, whose surface loads on
 *   the row's first intent
 * @position Tests; validates DropdownMenuSubMenuRow.tsx and the data path in
 *   renderDropdownItems.tsx
 */

import {readFileSync} from 'node:fs';
import path from 'node:path';
import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {DropdownMenu} from './DropdownMenu';
import {subMenuSurfaceLoader} from './DropdownMenuSubMenuRow';

const ITEMS = [
  {label: 'Rename'},
  {
    label: 'Move to',
    items: [{label: 'Apollo launch'}, {label: 'Zephyr'}],
  },
];

/** Holds each surface load until the test releases it. */
function holdSurfaceLoads(): {release: () => Promise<void>} {
  const realLoad = subMenuSurfaceLoader.load.bind(subMenuSurfaceLoader);
  let releaseHold: () => void = () => {};
  const held = new Promise<void>(resolve => {
    releaseHold = resolve;
  });
  vi.spyOn(subMenuSurfaceLoader, 'load').mockImplementation(async () => {
    await held;
    return realLoad();
  });
  vi.spyOn(subMenuSurfaceLoader, 'loaded').mockReturnValue(null);
  return {
    release: async () => {
      await act(async () => {
        releaseHold();
        await held;
      });
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a data item sub-menu', () => {
  it('reaches its surface module only through import(), so a menu without nested items loads none of it', () => {
    for (const file of [
      'renderDropdownItems.tsx',
      'DropdownMenuSubMenuRow.tsx',
    ]) {
      const source = readFileSync(path.resolve(__dirname, file), 'utf8');
      expect(source).not.toMatch(
        /^import\s+(?!type\b)[^;]*from\s+'\.\/DropdownMenuSubMenu';/m,
      );
    }
  });

  it('renders its row before the surface loads, with the closed popup state', async () => {
    const user = userEvent.setup();
    holdSurfaceLoads();
    render(<DropdownMenu button={{label: 'File actions'}} items={ITEMS} />);
    await user.click(
      screen.getByRole('button', {name: 'File actions', hidden: true}),
    );

    const row = screen.getByRole('menuitem', {name: 'Move to', hidden: true});
    expect(row).toHaveAttribute('aria-haspopup', 'menu');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(row).not.toHaveAttribute('aria-controls');
    expect(subMenuSurfaceLoader.load).not.toHaveBeenCalled();
  });

  it('opens on an open key pressed while the surface loads, keeping the same row, and focuses the first nested item', async () => {
    const user = userEvent.setup();
    const hold = holdSurfaceLoads();
    render(<DropdownMenu button={{label: 'File actions'}} items={ITEMS} />);
    await user.click(
      screen.getByRole('button', {name: 'File actions', hidden: true}),
    );
    const row = screen.getByRole('menuitem', {name: 'Move to', hidden: true});
    act(() => {
      row.focus();
    });
    await user.keyboard('{ArrowRight}');
    expect(row).toHaveAttribute('aria-expanded', 'false');

    await hold.release();

    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Apollo launch', hidden: true}),
      ).toHaveFocus();
    });
    // The row is the same element: nothing remounted across the load.
    expect(screen.getByRole('menuitem', {name: 'Move to', hidden: true})).toBe(
      row,
    );
    expect(row).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps focus on the row across a load that focus started', async () => {
    const user = userEvent.setup();
    const hold = holdSurfaceLoads();
    render(<DropdownMenu button={{label: 'File actions'}} items={ITEMS} />);
    await user.click(
      screen.getByRole('button', {name: 'File actions', hidden: true}),
    );
    const row = screen.getByRole('menuitem', {name: 'Move to', hidden: true});
    act(() => {
      row.focus();
    });
    expect(subMenuSurfaceLoader.load).toHaveBeenCalledTimes(1);

    await hold.release();

    expect(row).toHaveFocus();
    expect(row).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens on a press made while the surface loads', async () => {
    const user = userEvent.setup();
    const hold = holdSurfaceLoads();
    render(<DropdownMenu button={{label: 'File actions'}} items={ITEMS} />);
    await user.click(
      screen.getByRole('button', {name: 'File actions', hidden: true}),
    );
    await user.click(
      screen.getByRole('menuitem', {name: 'Move to', hidden: true}),
    );

    await hold.release();

    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Move to', hidden: true}),
      ).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('leaves the row operable after a failed load, and the next intent loads again', async () => {
    const user = userEvent.setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const realLoad = subMenuSurfaceLoader.load.bind(subMenuSurfaceLoader);
    vi.spyOn(subMenuSurfaceLoader, 'loaded').mockReturnValue(null);
    vi.spyOn(subMenuSurfaceLoader, 'load')
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(realLoad);
    render(<DropdownMenu button={{label: 'File actions'}} items={ITEMS} />);
    await user.click(
      screen.getByRole('button', {name: 'File actions', hidden: true}),
    );
    const row = screen.getByRole('menuitem', {name: 'Move to', hidden: true});
    // Focus starts the first load, which fails.
    act(() => {
      row.focus();
    });
    await waitFor(() => {
      expect(warn).toHaveBeenCalled();
    });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(row).toHaveFocus();

    await user.keyboard('{ArrowRight}');

    await waitFor(() => {
      expect(
        screen.getByRole('menuitem', {name: 'Apollo launch', hidden: true}),
      ).toHaveFocus();
    });
    expect(screen.getByRole('menuitem', {name: 'Move to', hidden: true})).toBe(
      row,
    );
  });
});
