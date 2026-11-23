// Copyright (c) Meta Platforms, Inc. and affiliates.

import {fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi, beforeEach} from 'vitest';
import {Text} from '../Text/Text';
import {__resetMenuPressForTest} from '../hooks/useMenuPress';
import type {DropdownMenuOption} from './DropdownMenu';
import {MenuBottomSheetActionList} from './MenuBottomSheetActionList';

afterEach(() => {
  __resetMenuPressForTest();
  Reflect.deleteProperty(document, 'elementFromPoint');
});

const touch = (pointerId = 1) => ({pointerType: 'touch', pointerId});
const mouse = (pointerId = 1) => ({
  pointerType: 'mouse',
  pointerId,
  button: 0,
});

function renderList() {
  return render(
    <MenuBottomSheetActionList
      items={[
        {label: 'Rename', onClick: () => {}},
        {label: 'Delete', onClick: () => {}},
      ]}
      onSelect={() => {}}
      onOpenSubmenu={() => {}}
    />,
  );
}

describe('MenuBottomSheetActionList', () => {
  it('a cancelled finger clears the row it lit in the sheet\u2019s action list; a mouse keeps its highlight (spec:AST-094 FR28, spec:AST-017 FR59)', () => {
    const {unmount} = renderList();
    fireEvent.pointerDown(
      screen.getByRole('button', {name: 'Rename'}),
      touch(),
    );
    fireEvent.pointerMove(
      screen.getByRole('button', {name: 'Delete'}),
      touch(),
    );
    expect(screen.getByRole('button', {name: 'Delete'})).toHaveFocus();
    // The browser takes the touch: a scroll of the sheet, say.
    fireEvent.pointerCancel(
      screen.getByRole('button', {name: 'Delete'}),
      touch(),
    );
    expect(screen.getByRole('button', {name: 'Delete'})).not.toHaveFocus();
    unmount();

    renderList();
    fireEvent.pointerDown(
      screen.getByRole('button', {name: 'Rename'}),
      mouse(),
    );
    fireEvent.pointerMove(
      screen.getByRole('button', {name: 'Delete'}),
      mouse(),
    );
    fireEvent.pointerCancel(
      screen.getByRole('button', {name: 'Delete'}),
      mouse(),
    );
    expect(screen.getByRole('button', {name: 'Delete'})).toHaveFocus();
  });

  describe('a press on the part of a row outside its action', () => {
    // The sheet hit-tests by point where the document can: give jsdom an
    // elementFromPoint before each sheet renders.
    beforeEach(() => {
      pointAt(document.body);
    });

    /**
     * The hit test answers `element` for every point, as under a still finger.
     */
    function pointAt(element: Element) {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: () => element,
      });
    }

    /** A press and a release on the same element: a tap or a click. */
    function press(element: Element, pointerType: 'touch' | 'mouse') {
      const init = pointerType === 'touch' ? touch() : mouse();
      pointAt(element);
      fireEvent.pointerDown(element, init);
      fireEvent.pointerUp(element, init);
    }

    function renderRows(items: DropdownMenuOption[]) {
      const onSelect = vi.fn();
      render(
        <MenuBottomSheetActionList
          items={items}
          onSelect={item => {
            onSelect(item.label);
          }}
          onOpenSubmenu={item => {
            onSelect(['submenu', item.label]);
          }}
        />,
      );
      const row = (label: string) =>
        screen
          .getAllByRole('listitem')
          .find(
            li =>
              li.querySelector('button, a')?.textContent?.includes(label) ===
              true,
          )!;
      return {onSelect, row};
    }

    const ROWS: DropdownMenuOption[] = [
      {label: 'Duplicate', icon: 'copy', onClick: () => {}},
      {
        label: 'Notes',
        icon: 'info',
        endContent: <Text type="supporting">21</Text>,
        onClick: () => {},
      },
    ];

    it.each(['touch', 'mouse'] as const)(
      'a %s press on the row’s icon, end content or padding runs the row, as a press on its label does',
      pointerType => {
        const {onSelect, row} = renderRows(ROWS);
        const spots: [Element, string][] = [
          [
            row('Duplicate').querySelector('button')!.firstElementChild!,
            'Duplicate',
          ],
          [row('Duplicate').querySelector('svg')!, 'Duplicate'],
          [row('Notes').querySelector('svg')!, 'Notes'],
          [screen.getByText('21'), 'Notes'],
          [row('Notes'), 'Notes'],
        ];
        for (const [spot, label] of spots) {
          onSelect.mockClear();
          press(spot, pointerType);
          expect(onSelect).toHaveBeenCalledExactlyOnceWith(label);
        }
      },
    );

    it('a finger that moves onto a row’s icon lights that row', () => {
      const {row} = renderRows(ROWS);
      const duplicate = row('Duplicate').querySelector('button')!;
      pointAt(duplicate);
      fireEvent.pointerDown(duplicate, touch());
      const notesIcon = row('Notes').querySelector('svg')!;
      pointAt(notesIcon);
      fireEvent.pointerMove(notesIcon, touch());
      expect(row('Notes').querySelector('button')).toHaveFocus();
    });

    it('a press on a link row’s icon selects the row through its link', () => {
      const {onSelect, row} = renderRows([
        {label: 'Docs', icon: 'info', href: '#docs'},
      ]);
      const anchorClick = vi.fn((event: MouseEvent) => event.preventDefault());
      row('Docs').querySelector('a')!.addEventListener('click', anchorClick);
      const icon = row('Docs').querySelector('svg')!;
      press(icon, 'mouse');
      // The browser's own click on the icon follows the release.
      fireEvent.click(icon, {detail: 1});
      expect(onSelect).toHaveBeenCalledExactlyOnceWith('Docs');
      expect(anchorClick).toHaveBeenCalledTimes(1);
    });

    it('a press on a submenu row’s chevron opens the submenu', () => {
      const {onSelect, row} = renderRows([
        {label: 'Share', items: [{label: 'Email', onClick: () => {}}]},
      ]);
      press(row('Share').querySelector('svg')!, 'touch');
      expect(onSelect).toHaveBeenCalledWith(['submenu', 'Share']);
    });

    it('a press on a disabled row’s icon runs nothing', () => {
      const onClick = vi.fn();
      const {onSelect, row} = renderRows([
        {label: 'Archive', icon: 'copy', isDisabled: true, onClick},
      ]);
      press(row('Archive').querySelector('svg')!, 'touch');
      press(row('Archive'), 'touch');
      expect(onSelect).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
    });

    it.each([
      ['link', {href: '#archive'}],
      ['button', {onClick: () => {}}],
    ] as const)(
      'a press on a disabled %s row’s icon or padding does not press a control in its end content',
      (_kind, action) => {
        const onEndClick = vi.fn();
        const {onSelect, row} = renderRows([
          {
            label: 'Archive',
            icon: 'copy',
            isDisabled: true,
            ...action,
            endContent: (
              <button type="button" onClick={onEndClick}>
                Pin
              </button>
            ),
          },
        ]);
        press(row('Archive').querySelector('svg')!, 'touch');
        press(row('Archive'), 'mouse');
        expect(onEndClick).not.toHaveBeenCalled();
        expect(onSelect).not.toHaveBeenCalled();
      },
    );

    it('a control in a row’s end content keeps its own press', () => {
      const onEndClick = vi.fn();
      const {onSelect} = renderRows([
        {
          label: 'Notes',
          onClick: () => {},
          endContent: (
            <button type="button" onClick={onEndClick}>
              Pin
            </button>
          ),
        },
      ]);
      press(screen.getByRole('button', {name: 'Pin'}), 'touch');
      expect(onEndClick).toHaveBeenCalledTimes(1);
      expect(onSelect).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a switch',
        <input key="s" type="checkbox" role="switch" aria-label="Pin" />,
      ],
      [
        'a disabled button',
        <button key="b" type="button" disabled aria-label="Pin">
          Pin
        </button>,
      ],
      [
        'a read-only checkbox',
        <input key="r" type="checkbox" aria-readonly="true" aria-label="Pin" />,
      ],
    ] as const)(
      'a press on %s in a row’s end content runs no row',
      (_kind, control) => {
        const {onSelect} = renderRows([
          {label: 'Notes', onClick: () => {}, endContent: control},
        ]);
        press(screen.getByLabelText('Pin'), 'touch');
        press(screen.getByLabelText('Pin'), 'mouse');
        expect(onSelect).not.toHaveBeenCalled();
      },
    );

    it('a press on the list outside every row, or on no element, runs no row', () => {
      const {onSelect} = renderRows(ROWS);
      press(screen.getByRole('list'), 'touch');
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: () => null,
      });
      const duplicate = screen.getByRole('button', {name: /Duplicate/});
      fireEvent.pointerDown(duplicate, touch());
      fireEvent.pointerUp(duplicate, touch());
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('a press on a section heading or a divider runs no row', () => {
      const {onSelect, row} = renderRows([
        {
          type: 'section',
          title: 'Edit',
          items: [{label: 'Cut', icon: 'copy', onClick: () => {}}],
        },
        {type: 'divider'},
        {label: 'Delete', onClick: () => {}},
      ]);
      press(screen.getByRole('heading', {name: 'Edit'}), 'touch');
      press(screen.getByRole('separator').closest('li')!, 'touch');
      expect(onSelect).not.toHaveBeenCalled();
      // The rows in the section still run from their icons.
      press(row('Cut').querySelector('svg')!, 'touch');
      expect(onSelect).toHaveBeenCalledWith('Cut');
    });
  });
});
