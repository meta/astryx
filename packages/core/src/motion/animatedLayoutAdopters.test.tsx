// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayoutAdopters.test.tsx
 * @input vitest (jsdom), React Testing Library, Collapsible, TreeList,
 *   useAnimatedLayout, a recording stand-in for Element.animate and stubbed
 *   rectangles for the content after the changed component
 * @output Checks each adopting component with and without a handle
 *   (`spec:AST-105` FR1, FR2): with one, a toggle glides the content after it
 *   inside the container and the chevron takes the spring; without one,
 *   nothing animates and the chevron keeps its own transition
 * @position Testing; the walk and the motion are covered in
 *   animatedLayout.test.ts and, in real browsers,
 *   __tests__/animatedLayout.interaction.browser.spec.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, render, renderHook, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {StrictMode, useRef, type ReactNode} from 'react';
import {Collapsible} from '../Collapsible/Collapsible';
import {CollapsibleGroup} from '../Collapsible/CollapsibleGroup';
import {TreeList} from '../TreeList/TreeList';
import type {TreeListItemData} from '../TreeList/TreeListTypes';
import {
  useAnimatedLayout,
  type AnimatedLayout,
} from '../hooks/useAnimatedLayout';

let animated: Element[] = [];
/** Each animation's finish listener, by the element it plays on. */
let finishes = new Map<Element, () => void>();
const originalAnimate = Element.prototype.animate;

/** Records an animation on `target` and keeps its finish listener. */
function recordAnimation(target: Element): Animation {
  animated.push(target);
  return {
    cancel() {},
    addEventListener(type: string, listener: () => void) {
      if (type === 'finish') {
        finishes.set(target, listener);
      }
    },
  } as unknown as Animation;
}

beforeEach(() => {
  animated = [];
  finishes = new Map();
  Element.prototype.animate = function animate(this: Element) {
    return recordAnimation(this);
  };
});

afterEach(() => {
  Element.prototype.animate = originalAnimate;
  vi.restoreAllMocks();
});

/**
 * A container with `children` and a following paragraph that sits 80 px lower
 * once anything has been measured (jsdom lays nothing out).
 */
function Area({
  children,
  withHandle,
}: {
  children: (layout: AnimatedLayout | undefined) => ReactNode;
  withHandle: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const layout = useAnimatedLayout({containerRef});
  return (
    <div ref={containerRef} data-testid="area">
      {children(withHandle ? layout : undefined)}
      <p data-testid="after">Notes</p>
    </div>
  );
}

function stubGeometry() {
  const area = screen.getByTestId('area');
  const after = screen.getByTestId('after');
  vi.spyOn(area, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 400, 600),
  );
  let reads = 0;
  vi.spyOn(after, 'getBoundingClientRect').mockImplementation(() => {
    reads += 1;
    // The first read is the measurement before the change commits.
    return new DOMRect(0, reads === 1 ? 40 : 120, 400, 20);
  });
  return after;
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('useAnimatedLayout', () => {
  it('returns the same member-free handle on every render', () => {
    const {result, rerender} = renderHook(() =>
      useAnimatedLayout({containerRef: useRef<HTMLElement>(null)}),
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(Object.keys(first)).toEqual([]);
  });
});

describe.each([
  {
    name: 'Collapsible',
    render: (layout: AnimatedLayout | undefined) => (
      <Collapsible trigger="Details" animatedLayout={layout}>
        Hidden content
      </Collapsible>
    ),
    toggle: () => screen.getByRole('button', {name: 'Details'}),
    chevron: () =>
      screen
        .getByRole('button', {name: 'Details'})
        .querySelector<HTMLElement>(':scope > .astryx-icon'),
  },
  {
    name: 'TreeList',
    render: (layout: AnimatedLayout | undefined) => (
      <TreeList
        items={
          [
            {
              id: 'src',
              label: 'src',
              children: [{id: 'index', label: 'index.ts'}],
            },
          ] satisfies TreeListItemData[]
        }
        animatedLayout={layout}
      />
    ),
    toggle: () =>
      document.querySelector<HTMLElement>('[data-tree-toggle]') ??
      document.body,
    chevron: () =>
      document.querySelector<HTMLElement>('[data-tree-toggle] > .astryx-icon'),
  },
])('$name adopts animatedLayout (spec:AST-105 FR1, FR2)', component => {
  it('glides the content after it inside the container with a handle', async () => {
    const user = userEvent.setup();
    render(<Area withHandle>{component.render}</Area>);
    const after = stubGeometry();
    await user.click(component.toggle());
    await flush();
    expect(animated).toContain(after);
    expect(
      component.chevron()?.style.getPropertyValue('transition-timing-function'),
    ).toMatch(/^linear\(/);
  });

  it('changes nothing without a handle', async () => {
    const user = userEvent.setup();
    render(<Area withHandle={false}>{component.render}</Area>);
    stubGeometry();
    await user.click(component.toggle());
    await flush();
    expect(animated).toEqual([]);
    expect(
      component.chevron()?.style.getPropertyValue('transition-duration'),
    ).toBe('');
  });
});

describe('Collapsible changes another component made (spec:AST-105 FR3)', () => {
  it('glides the items between when a single-mode group closes one item to open another', async () => {
    const user = userEvent.setup();
    render(
      <Area withHandle>
        {layout => (
          <CollapsibleGroup type="single" defaultValue="shipping">
            <Collapsible
              value="shipping"
              trigger="Shipping"
              animatedLayout={layout}>
              Shipping details
            </Collapsible>
            <Collapsible
              value="payment"
              trigger="Payment"
              animatedLayout={layout}>
              Payment details
            </Collapsible>
            <Collapsible
              value="warranty"
              trigger="Warranty"
              animatedLayout={layout}>
              Warranty details
            </Collapsible>
          </CollapsibleGroup>
        )}
      </Area>,
    );
    stubGeometry();
    // The Payment item sits between the one that closes and the one that
    // opens: it moves up when Shipping closes.
    const payment = screen
      .getByRole('button', {name: 'Payment'})
      .closest<HTMLElement>('.astryx-collapsible');
    expect(payment).not.toBeNull();
    let reads = 0;
    vi.spyOn(
      payment as HTMLElement,
      'getBoundingClientRect',
    ).mockImplementation(() => {
      reads += 1;
      return new DOMRect(0, reads === 1 ? 140 : 40, 400, 40);
    });
    await user.click(screen.getByRole('button', {name: 'Warranty'}));
    await flush();
    expect(animated).toContain(payment);
  });

  it('glides an owner-set isOpen too (spec:AST-105 FR1: each change is reported)', async () => {
    const {rerender} = render(
      <Area withHandle>
        {layout => (
          <Collapsible trigger="Details" isOpen={false} animatedLayout={layout}>
            Hidden content
          </Collapsible>
        )}
      </Area>,
    );
    const after = stubGeometry();
    rerender(
      <Area withHandle>
        {layout => (
          <Collapsible trigger="Details" isOpen animatedLayout={layout}>
            Hidden content
          </Collapsible>
        )}
      </Area>,
    );
    await flush();
    expect(animated).toContain(after);
  });

  it("glides a group's controlled value change", async () => {
    const group = (value: string, layout: AnimatedLayout | undefined) => (
      <CollapsibleGroup value={value} onChange={() => {}}>
        <Collapsible trigger="One" value="one" animatedLayout={layout}>
          First
        </Collapsible>
        <Collapsible trigger="Two" value="two" animatedLayout={layout}>
          Second
        </Collapsible>
      </CollapsibleGroup>
    );
    const {rerender} = render(
      <Area withHandle>{layout => group('one', layout)}</Area>,
    );
    const after = stubGeometry();
    rerender(<Area withHandle>{layout => group('two', layout)}</Area>);
    await flush();
    expect(animated).toContain(after);
  });

  it('glides a TreeList row whose isExpanded changed in items', async () => {
    const tree = (isExpanded: boolean, layout: AnimatedLayout | undefined) => (
      <TreeList
        aria-label="Files"
        items={[
          {
            id: 'src',
            label: 'src',
            isExpanded,
            children: [{id: 'index', label: 'index.ts'}],
          },
        ]}
        animatedLayout={layout}
      />
    );
    const {rerender} = render(
      <Area withHandle>{layout => tree(false, layout)}</Area>,
    );
    const after = stubGeometry();
    rerender(<Area withHandle>{layout => tree(true, layout)}</Area>);
    await flush();
    expect(animated).toContain(after);
  });

  it('measures once in StrictMode, and not at all for a change that never lands', async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <Area withHandle>
          {layout => (
            // An owner that refuses every toggle: nothing changes, so
            // nothing is measured and no batch is left behind.
            <Collapsible
              trigger="Details"
              isOpen={false}
              onOpenChange={() => {}}
              animatedLayout={layout}>
              Hidden content
            </Collapsible>
          )}
        </Area>
      </StrictMode>,
    );
    const after = screen.getByTestId('after');
    const reads = vi.spyOn(after, 'getBoundingClientRect');
    await user.click(screen.getByRole('button', {name: 'Details'}));
    await flush();
    expect(reads).not.toHaveBeenCalled();
    expect(animated).toEqual([]);
  });
});

describe("a close plays the content's exit (spec:AST-105 FR4)", () => {
  it("keeps a closing Collapsible's content rendered, inert and out of flow until its exit ends", async () => {
    const user = userEvent.setup();
    render(
      <Area withHandle>
        {layout => (
          <Collapsible trigger="Details" defaultIsOpen animatedLayout={layout}>
            Shown content
          </Collapsible>
        )}
      </Area>,
    );
    stubGeometry();
    const trigger = screen.getByRole('button', {name: 'Details'});
    const content = document.getElementById(
      trigger.getAttribute('aria-controls') ?? '',
    ) as HTMLElement;
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 40, 400, 40),
    );
    await user.click(trigger);
    await flush();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Still on screen for the exit, out of reach, giving up its space.
    expect(getComputedStyle(content).display).not.toBe('none');
    expect(content).toHaveAttribute('inert');
    expect(content.style.getPropertyValue('margin-block-end')).not.toBe('');
    expect(animated).toContain(screen.getByTestId('after'));
    act(() => finishes.get(content)?.());
    expect(getComputedStyle(content).display).toBe('none');
    expect(content).not.toHaveAttribute('inert');
    expect(content.style.getPropertyValue('margin-block-end')).toBe('');
  });

  it("keeps a collapsing TreeList row's child group until its exit ends, out of the keyboard order", async () => {
    const user = userEvent.setup();
    render(
      <Area withHandle>
        {layout => (
          <TreeList
            items={[
              {
                id: 'src',
                label: 'src',
                isExpanded: true,
                children: [{id: 'index', label: 'index.ts'}],
              },
            ]}
            animatedLayout={layout}
          />
        )}
      </Area>,
    );
    stubGeometry();
    const groupOf = () =>
      document.querySelector<HTMLElement>(
        '[data-tree-id="src"] > [role="group"]',
      );
    vi.spyOn(groupOf() as HTMLElement, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 40, 400, 40),
    );
    await user.click(
      document.querySelector<HTMLElement>('[data-tree-toggle]') ??
        document.body,
    );
    await flush();
    const group = groupOf();
    expect(group).not.toBeNull();
    expect(group).toHaveAttribute('inert');
    expect(group?.style.getPropertyValue('margin-block-end')).not.toBe('');
    // The tree's keyboard order (the rows its focus model reaches) has only
    // the collapsed row.
    expect(
      document.querySelectorAll('[role="treeitem"]:not([data-tree-exiting] *)'),
    ).toHaveLength(1);
    act(() => finishes.get(group as HTMLElement)?.());
    expect(groupOf()).toBeNull();
  });

  it('collapses a row with an expanded child as one change: only the outer group exits, and the child goes with it', async () => {
    const user = userEvent.setup();
    render(
      <Area withHandle>
        {layout => (
          <TreeList
            aria-label="Files"
            items={[
              {
                id: 'photos',
                label: 'Photos',
                isExpanded: true,
                children: [
                  {
                    id: 'trips',
                    label: 'Trips',
                    isExpanded: true,
                    children: [{id: 'snow', label: 'Snow.jpg'}],
                  },
                ],
              },
            ]}
            animatedLayout={layout}
          />
        )}
      </Area>,
    );
    stubGeometry();
    const groupOf = (id: string) =>
      document.querySelector<HTMLElement>(
        `[data-tree-id="${id}"] > [role="group"]`,
      );
    vi.spyOn(
      groupOf('photos') as HTMLElement,
      'getBoundingClientRect',
    ).mockReturnValue(new DOMRect(0, 40, 400, 80));
    await user.click(
      document.querySelector<HTMLElement>(
        '[data-tree-id="photos"] > div [data-tree-toggle]',
      ) ?? document.body,
    );
    await flush();
    const outer = groupOf('photos');
    // Only the outer group is held; the child's group stays inside it as it
    // was, so the content after them moves once.
    expect(outer?.style.getPropertyValue('margin-block-end')).not.toBe('');
    expect(groupOf('trips')?.style.getPropertyValue('margin-block-end')).toBe(
      '',
    );
    act(() => finishes.get(outer as HTMLElement)?.());
    expect(groupOf('photos')).toBeNull();
  });

  it("drops the chevron's spring when the handle is removed", async () => {
    const user = userEvent.setup();
    const {rerender} = render(
      <Area withHandle>
        {layout => (
          <Collapsible trigger="Details" animatedLayout={layout}>
            Content
          </Collapsible>
        )}
      </Area>,
    );
    await user.click(screen.getByRole('button', {name: 'Details'}));
    const chevron = screen
      .getByRole('button', {name: 'Details'})
      .querySelector<HTMLElement>(':scope > .astryx-icon');
    expect(chevron?.style.getPropertyValue('transition-duration')).not.toBe('');
    rerender(
      <Area withHandle={false}>
        {layout => (
          <Collapsible trigger="Details" animatedLayout={layout}>
            Content
          </Collapsible>
        )}
      </Area>,
    );
    expect(chevron?.style.getPropertyValue('transition-duration')).toBe('');
  });

  it('lands a close at once without a handle', async () => {
    const user = userEvent.setup();
    render(
      <Area withHandle={false}>
        {layout => (
          <Collapsible trigger="Details" defaultIsOpen animatedLayout={layout}>
            Shown content
          </Collapsible>
        )}
      </Area>,
    );
    const trigger = screen.getByRole('button', {name: 'Details'});
    await user.click(trigger);
    const content = document.getElementById(
      trigger.getAttribute('aria-controls') ?? '',
    ) as HTMLElement;
    expect(getComputedStyle(content).display).toBe('none');
    expect(content).not.toHaveAttribute('inert');
  });
});
