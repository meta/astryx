// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListItemContextMenu.test.tsx
 * @input vitest (jsdom), a List whose rows pass their ref to useContextMenu,
 *   and the same List with ContextMenu around each row
 * @output Checks a row menu on a ListItem: it attaches to the row's own `li`,
 *   so the list keeps `ul > li` with no wrapper, each row keeps the classes
 *   it draws its divider with, and a right click opens the row's menu. The
 *   ContextMenu wrapper's `ul > div > li` is the control that shows the
 *   check finds a wrapper.
 * @position Testing for List.tsx and ListItem.tsx with useContextMenu
 */

import {act, render} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ContextMenu} from '../../ContextMenu/ContextMenu';
import {useContextMenu} from '../../ContextMenu/useContextMenu';
import {List} from '../List';
import {ListItem} from '../ListItem';

const LABELS = ['Inbox', 'Sent', 'Drafts', 'Archive'];

beforeEach(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function RowWithMenu({label}: {label: string}) {
  const rowRef = useRef<HTMLLIElement>(null);
  useContextMenu(rowRef, {
    label: `Actions for ${label}`,
    items: [{label: 'Archive'}, {label: 'Delete'}],
  });
  return <ListItem ref={rowRef} label={label} />;
}

function listOf(container: HTMLElement): HTMLUListElement {
  const list = container.querySelector('ul');
  if (list == null) {
    throw new Error('no list');
  }
  return list;
}

describe('a row menu on a ListItem (useContextMenu)', () => {
  it('attaches to the row\u2019s own li: the list keeps ul > li with no wrapper', () => {
    const {container} = render(
      <List hasDividers>
        {LABELS.map(label => (
          <RowWithMenu key={label} label={label} />
        ))}
      </List>,
    );
    const list = listOf(container);
    expect(Array.from(list.children, child => child.tagName)).toEqual(
      LABELS.map(() => 'LI'),
    );
    expect(Array.from(list.children, child => child.textContent)).toEqual(
      LABELS,
    );
    // The menus render outside the list.
    expect(list.querySelector('[role="menu"]')).toBeNull();
  });

  it('keeps each row\u2019s divider classes: the rows draw what rows without a menu draw', () => {
    const withMenus = render(
      <List hasDividers>
        {LABELS.map(label => (
          <RowWithMenu key={label} label={label} />
        ))}
      </List>,
    );
    const classesWithMenus = Array.from(
      listOf(withMenus.container).children,
      row => row.className,
    );
    withMenus.unmount();
    const withoutMenus = render(
      <List hasDividers>
        {LABELS.map(label => (
          <ListItem key={label} label={label} />
        ))}
      </List>,
    );
    expect(
      Array.from(listOf(withoutMenus.container).children, row => row.className),
    ).toEqual(classesWithMenus);
  });

  it('a right click on a row opens its menu, named for that row', () => {
    const {container} = render(
      <List hasDividers>
        {LABELS.map(label => (
          <RowWithMenu key={label} label={label} />
        ))}
      </List>,
    );
    const sent = listOf(container).children[1];
    act(() => {
      sent.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 40,
          clientY: 50,
          button: 2,
        }),
      );
    });
    const menu = document.querySelector<HTMLElement>(
      '[role="menu"][aria-label="Actions for Sent"]',
    );
    expect(menu?.closest('[popover]')?.hasAttribute('popover-open')).toBe(true);
  });

  it('control: ContextMenu around a ListItem puts a wrapper between the list and its row', () => {
    const {container} = render(
      <List hasDividers>
        {LABELS.map(label => (
          <ContextMenu key={label} items={[{label: 'Archive'}]}>
            <ListItem label={label} />
          </ContextMenu>
        ))}
      </List>,
    );
    const list = listOf(container);
    expect(
      Array.from(list.children).filter(child => child.tagName !== 'LI'),
    ).not.toHaveLength(0);
    expect(list.querySelectorAll(':scope > li')).toHaveLength(0);
    expect(list.querySelectorAll(':scope > div > li')).toHaveLength(
      LABELS.length,
    );
  });
});
