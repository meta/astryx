// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuPressDesktopParity.test.tsx
 * @input vitest (jsdom), every Core menu that runs the menu press, pressed with
 *   a mouse while a page handler stops or cancels the press-down
 * @output The released behavior of each menu for a mouse, row by row. The
 *   press starts in React's order at the menu's or trigger's own handler. So
 *   only a stop before that handler keeps it from starting
 * @position Desktop parity tests of the menu press across Core's menus. The
 *   same file passes on the release before the ref form.
 */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import type {ReactNode} from 'react';
import {DropdownMenu} from '../../DropdownMenu/DropdownMenu';
import {DropdownMenuItem} from '../../DropdownMenu/DropdownMenuItem';
import {DropdownMenuSubMenu} from '../../DropdownMenu/DropdownMenuSubMenu';
import {NavHeadingMenu} from '../../NavMenu/NavHeadingMenu';
import {NavHeadingMenuItem} from '../../NavMenu/NavHeadingMenuItem';
import {TopNavMenu} from '../../TopNav/TopNavMenu';
import {TopNavHeading} from '../../TopNav/TopNavHeading';
import {SideNavHeading} from '../../SideNav/SideNavHeading';
import {Breadcrumbs} from '../../Breadcrumbs/Breadcrumbs';
import {BreadcrumbItem} from '../../Breadcrumbs/BreadcrumbItem';
import {TabList} from '../../TabList/TabList';
import {Tab} from '../../TabList/Tab';
import {TabMenu} from '../../TabList/TabMenu';
import {Selector} from '../../Selector/Selector';
import {ContextMenu} from '../../ContextMenu/ContextMenu';
import {warmMenuBottomSheet} from '../../DropdownMenu/__tests__/warmMenuBottomSheet';
import {__resetMenuPressForTest} from '../useMenuPress';

type Wrap = (node: ReactNode) => ReactNode;

/** Leaves the menu as it is. */
function unwrapped(node: ReactNode): ReactNode {
  return node;
}

interface Scenario {
  readonly name: string;
  /** Adds the page's handler; returns its removal. */
  readonly install?: (pressed: HTMLElement) => () => void;
  /** Puts the menu inside an ancestor with its own handler. */
  readonly wrap?: Wrap;
  /** Whether the released menus act on the press. */
  readonly acts: boolean;
}

const stop = (event: Event) => event.stopPropagation();
const cancel = (event: Event) => event.preventDefault();

function listen(
  target: () => EventTarget,
  handler: (event: Event) => void,
  capture = false,
): Scenario['install'] {
  return () => {
    const at = target();
    at.addEventListener('pointerdown', handler, capture);
    return () => at.removeEventListener('pointerdown', handler, capture);
  };
}

const SCENARIOS: ReadonlyArray<Scenario> = [
  {name: 'no page handler', acts: true},
  {
    name: 'a document bubble listener stops it',
    install: listen(() => document, stop),
    acts: true,
  },
  {
    name: 'a body bubble listener, above the React root, stops it',
    install: listen(() => document.body, stop),
    acts: true,
  },
  {
    name: "an ancestor's onPointerDown stops it",
    wrap: node => (
      <div onPointerDown={event => event.stopPropagation()}>{node}</div>
    ),
    acts: true,
  },
  {
    name: 'a window bubble listener stops it',
    install: listen(() => window, stop),
    acts: true,
  },
  {
    name: 'a listener on the pressed element stops it',
    install: pressed => {
      pressed.addEventListener('pointerdown', stop);
      return () => pressed.removeEventListener('pointerdown', stop);
    },
    acts: false,
  },
  {
    name: 'a document capture listener stops it',
    install: listen(() => document, stop, true),
    acts: false,
  },
  {
    name: 'a document bubble listener cancels it',
    install: listen(() => document, cancel),
    acts: true,
  },
  {
    name: "an ancestor's onPointerDown cancels it",
    wrap: node => (
      <div onPointerDown={event => event.preventDefault()}>{node}</div>
    ),
    acts: true,
  },
];

let nextPointerId = 1;
const mouse = () => ({
  pointerType: 'mouse',
  pointerId: nextPointerId++,
  button: 0,
});

type Rows = readonly [HTMLElement, HTMLElement];

/** A menu open with two rows: a press from the first lifts on the second. */
interface RowsCase {
  /** Renders the menu, opens it and returns its two rows. */
  readonly open: (wrap: Wrap) => Promise<Rows>;
  /** Whether the second row acted. */
  readonly acted: () => boolean;
}

function rowsCase(
  build: (spy: () => void, wrap: Wrap) => Rows | Promise<Rows>,
): RowsCase {
  const spy = vi.fn();
  return {
    open: async wrap => build(spy, wrap),
    acted: () => spy.mock.calls.length > 0,
  };
}

const menuItems = () => screen.getAllByRole('menuitem', {hidden: true});

const ROW_MENUS: Record<string, () => RowsCase> = {
  DropdownMenu: () =>
    rowsCase((spy, wrap) => {
      render(
        <>
          {wrap(
            <DropdownMenu button={{label: 'Actions'}}>
              <DropdownMenuItem label="Edit" onClick={() => {}} />
              <DropdownMenuItem label="Duplicate" onClick={spy} />
            </DropdownMenu>,
          )}
        </>,
      );
      fireEvent.click(screen.getByRole('button', {name: /Actions/}));
      const [a, b] = menuItems();
      return [a, b];
    }),
  DropdownMenuSubMenu: () =>
    rowsCase((spy, wrap) => {
      render(
        <>
          {wrap(
            <DropdownMenu button={{label: 'Actions'}}>
              <DropdownMenuItem label="Rename" onClick={() => {}} />
              <DropdownMenuSubMenu label="Move to">
                <DropdownMenuItem label="Folder A" onClick={() => {}} />
                <DropdownMenuItem label="Folder B" onClick={spy} />
              </DropdownMenuSubMenu>
            </DropdownMenu>,
          )}
        </>,
      );
      fireEvent.click(screen.getByRole('button', {name: /Actions/}));
      fireEvent.click(
        screen.getByRole('menuitem', {name: /Move to/, hidden: true}),
      );
      return [
        screen.getByRole('menuitem', {name: 'Folder A', hidden: true}),
        screen.getByRole('menuitem', {name: 'Folder B', hidden: true}),
      ];
    }),
  NavHeadingMenu: () =>
    rowsCase((spy, wrap) => {
      render(
        <>
          {wrap(
            <NavHeadingMenu>
              <NavHeadingMenuItem label="A" />
              <NavHeadingMenuItem label="B" onClick={spy} />
            </NavHeadingMenu>,
          )}
        </>,
      );
      const [a, b] = menuItems();
      return [a, b];
    }),
  TopNavMenu: () =>
    rowsCase((spy, wrap) => {
      render(
        <>
          {wrap(
            <TopNavMenu
              label="Products"
              items={[
                {title: 'Analytics', onClick: () => {}},
                {title: 'Messaging', onClick: spy},
              ]}
            />,
          )}
        </>,
      );
      fireEvent.click(screen.getByRole('button', {name: /Products/}));
      return [
        screen.getByRole('menuitem', {name: /Analytics/, hidden: true}),
        screen.getByRole('menuitem', {name: /Messaging/, hidden: true}),
      ];
    }),
  TopNavHeading: () =>
    rowsCase((spy, wrap) => {
      render(
        <>
          {wrap(
            <TopNavHeading
              heading="Acme"
              menu={
                <>
                  <NavHeadingMenuItem label="A" />
                  <NavHeadingMenuItem label="B" onClick={spy} />
                </>
              }
            />,
          )}
        </>,
      );
      fireEvent.click(screen.getByRole('button', {name: /Acme/}));
      const [a, b] = menuItems();
      return [a, b];
    }),
  SideNavHeading: () =>
    rowsCase((spy, wrap) => {
      render(
        <>
          {wrap(
            <SideNavHeading
              heading="Acme"
              menu={
                <>
                  <NavHeadingMenuItem label="A" />
                  <NavHeadingMenuItem label="B" onClick={spy} />
                </>
              }
            />,
          )}
        </>,
      );
      fireEvent.click(screen.getByRole('button', {name: /Acme/}));
      const [a, b] = menuItems();
      return [a, b];
    }),
  BreadcrumbItem: () =>
    rowsCase((spy, wrap) => {
      render(
        <>
          {wrap(
            <Breadcrumbs>
              <BreadcrumbItem href="/">Home</BreadcrumbItem>
              <BreadcrumbItem
                menu={[
                  {label: 'Design', onClick: () => {}},
                  {label: 'Engineering', onClick: spy},
                ]}>
                Teams
              </BreadcrumbItem>
            </Breadcrumbs>,
          )}
        </>,
      );
      fireEvent.click(screen.getByRole('button', {name: 'Teams'}));
      const [a, b] = menuItems();
      return [a, b];
    }),
  TabMenu: () =>
    rowsCase((spy, wrap) => {
      render(
        <>
          {wrap(
            <TabList
              value="home"
              onChange={value => {
                if (value === 'reports') {
                  spy();
                }
              }}>
              <Tab value="home" label="Home" />
              <TabMenu
                label="More"
                options={[
                  {value: 'analytics', label: 'Analytics'},
                  {value: 'reports', label: 'Reports'},
                ]}
              />
            </TabList>,
          )}
        </>,
      );
      fireEvent.click(screen.getByRole('button', {name: /More/}));
      const [a, b] = screen.getAllByRole('menuitemradio', {hidden: true});
      return [a, b];
    }),
  Selector: () =>
    rowsCase((spy, wrap) => {
      render(
        <>
          {wrap(
            <Selector
              label="Fruit"
              options={['Apple', 'Banana']}
              onChange={value => {
                if (value === 'Banana') {
                  spy();
                }
              }}
            />,
          )}
        </>,
      );
      fireEvent.click(screen.getByRole('combobox'));
      const [a, b] = screen.getAllByRole('option', {hidden: true});
      return [a, b];
    }),
  MenuBottomSheetActionList: () =>
    rowsCase(async (spy, wrap) => {
      render(
        <>
          {wrap(
            <DropdownMenu
              button={{label: 'Actions'}}
              presentation="bottom-sheet"
              isMenuOpen
              items={[
                {label: 'Edit', onClick: () => {}},
                {label: 'Duplicate', onClick: spy},
              ]}
            />,
          )}
        </>,
      );
      return [
        await screen.findByRole('button', {name: 'Edit', hidden: true}),
        screen.getByRole('button', {name: 'Duplicate', hidden: true}),
      ];
    }),
  ContextMenu: () =>
    rowsCase((spy, wrap) => {
      render(
        <>
          {wrap(
            <ContextMenu
              items={[
                {label: 'Cut', onClick: () => {}},
                {label: 'Copy', onClick: spy},
              ]}>
              <div>Right-click me</div>
            </ContextMenu>,
          )}
        </>,
      );
      fireEvent.contextMenu(screen.getByText('Right-click me'));
      const [a, b] = menuItems();
      return [a, b];
    }),
};

const originalShow = HTMLElement.prototype.showPopover;
const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeAll(warmMenuBottomSheet, 20000);
const originalHide = HTMLElement.prototype.hidePopover;
const originalMatches = HTMLElement.prototype.matches;

beforeEach(() => {
  __resetMenuPressForTest();
  // jsdom has no popover: the shim keeps the open state and its toggle event.
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'open'});
    this.dispatchEvent(event);
  };
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    this.removeAttribute('popover-open');
    const event = new Event('toggle', {bubbles: false});
    Object.defineProperty(event, 'newState', {value: 'closed'});
    this.dispatchEvent(event);
  };
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HTMLElement.prototype as any).matches = function (
    this: HTMLElement,
    selector: string,
  ): boolean {
    if (selector === ':popover-open') {
      return this.hasAttribute('popover-open');
    }
    return originalMatches.call(this, selector);
  };
});

afterEach(() => {
  // Unmount while the shims stand: a sheet closes its dialog as it goes.
  cleanup();
  HTMLElement.prototype.showPopover = originalShow;
  HTMLElement.prototype.hidePopover = originalHide;
  HTMLElement.prototype.matches = originalMatches;
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
});

describe('menu press, desktop parity: a mouse press on the trigger', () => {
  it.each(SCENARIOS.map(scenario => [scenario.name, scenario] as const))(
    'DropdownMenu opens on a press-down when %s, as released',
    (_, scenario) => {
      const wrap: Wrap = scenario.wrap ?? unwrapped;
      render(
        <>
          {wrap(
            <DropdownMenu button={{label: 'Actions'}}>
              <DropdownMenuItem label="Edit" onClick={() => {}} />
            </DropdownMenu>,
          )}
        </>,
      );
      const trigger = screen.getByRole('button', {name: /Actions/});
      const pointer = mouse();
      const remove = scenario.install?.(trigger) ?? (() => {});
      try {
        fireEvent.pointerDown(trigger, pointer);
      } finally {
        remove();
      }
      expect(trigger.getAttribute('aria-expanded') === 'true').toBe(
        scenario.acts,
      );
      fireEvent.pointerUp(trigger, pointer);
    },
  );
});

describe('menu press, desktop parity: a mouse press-drag-release on two rows', () => {
  const cases = Object.keys(ROW_MENUS).flatMap(menu =>
    SCENARIOS.map(scenario => [menu, scenario.name, scenario] as const),
  );
  it.each(cases)(
    '%s acts on the release when %s, as released',
    async (menu, _, scenario) => {
      const menuCase = ROW_MENUS[menu]();
      const [a, b] = await menuCase.open(scenario.wrap ?? unwrapped);
      const pointer = mouse();
      const remove = scenario.install?.(a) ?? (() => {});
      try {
        fireEvent.pointerDown(a, pointer);
      } finally {
        remove();
      }
      fireEvent.pointerMove(b, pointer);
      fireEvent.pointerUp(b, pointer);
      expect(menuCase.acted()).toBe(scenario.acts);
    },
  );

  it.each([true, false])(
    'NavHeadingMenu acts on the release unless its own onPointerDown cancels it, as released (cancels: %s)',
    isCancelling => {
      const onB = vi.fn();
      render(
        <NavHeadingMenu
          onPointerDown={event => {
            if (isCancelling) {
              event.preventDefault();
            }
          }}>
          <NavHeadingMenuItem label="A" />
          <NavHeadingMenuItem label="B" onClick={onB} />
        </NavHeadingMenu>,
      );
      const [a, b] = menuItems();
      const pointer = mouse();
      fireEvent.pointerDown(a, pointer);
      fireEvent.pointerMove(b, pointer);
      fireEvent.pointerUp(b, pointer);
      expect(onB.mock.calls.length > 0).toBe(!isCancelling);
    },
  );
});
