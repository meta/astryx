// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchHitArea.test.tsx
 * @input Vitest, Testing Library, StyleX's injected rules, stubbed element
 *   rects and a stubbed `document.elementsFromPoint`
 * @output Tests for the touch hit area: no work before a press, the press
 *   check at a tap's click (a visible box under the finger takes the tap),
 *   and the band's per-side room in CSS
 * @position Unit test for utils/touchHitArea.ts and
 *   internal/touchHitArea.stylex.ts. The real-browser geometry is in
 *   __tests__/touchHitArea.interaction.browser.spec.ts
 */

import * as stylex from '@stylexjs/stylex';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import {useTouchHitArea} from './touchHitArea';
import {grownHitInputProps} from '../privateAttributes/grownHitInput.stylex';
import {fieldFrameProps} from '../privateAttributes/fieldFrame.stylex';
import {touchHitAreaStyles} from '../internal/touchHitArea.stylex';
import {Button} from '../Button/Button';
import {ButtonGroup} from '../ButtonGroup/ButtonGroup';
import {InfoTip} from '../InfoTip/InfoTip';
import {List} from '../List/List';
import {Typeahead} from '../Typeahead/Typeahead';
import {ListItem} from '../List/ListItem';

function Host({id, onClick}: {id: string; onClick?: () => void}) {
  const ref = useTouchHitArea(true);
  return (
    <button
      ref={ref}
      id={id}
      type="button"
      onClick={onClick}
      {...stylex.props(touchHitAreaStyles.layer)}>
      {id}
    </button>
  );
}

const coarse = (media: string) =>
  ({
    media,
    matches: media.includes('pointer: coarse'),
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;

function rect(left: number, top: number, width: number, height: number) {
  const box = {left, top, right: left + width, bottom: top + height};
  return {...box, x: left, y: top, width, height, toJSON: () => box} as DOMRect;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('before a press', () => {
  it('reads no layout, starts no observer and adds no element or document listener, however many controls mount', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(coarse);
    const reads = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    let observers = 0;
    for (const name of [
      'MutationObserver',
      'ResizeObserver',
      'IntersectionObserver',
    ]) {
      vi.stubGlobal(
        name,
        class {
          constructor() {
            observers += 1;
          }
          observe() {}
          unobserve() {}
          disconnect() {}
          takeRecords() {
            return [];
          }
        },
      );
    }
    // React's root delegates events: count only the controls' own listeners.
    const onControls: string[] = [];
    vi.spyOn(HTMLElement.prototype, 'addEventListener').mockImplementation(
      function (this: HTMLElement, type: string) {
        if (this.id.startsWith('control-')) {
          onControls.push(type);
        }
      },
    );
    const onDocument = vi.spyOn(document, 'addEventListener');
    const onWindow = vi.spyOn(window, 'addEventListener');
    const frames = vi.fn();
    vi.stubGlobal('requestAnimationFrame', frames);
    const {unmount} = render(
      <div>
        {Array.from({length: 50}, (_, index) => (
          <Host key={index} id={`control-${index}`} />
        ))}
      </div>,
    );
    expect(reads).not.toHaveBeenCalled();
    expect(observers).toBe(0);
    expect(frames).not.toHaveBeenCalled();
    expect(onControls).toEqual([]);
    // React's root adds its own document listeners, such as selectionchange.
    expect(
      onDocument.mock.calls.filter(([type]) =>
        /^(pointer|touch|click|scroll|resize)/.test(type),
      ),
    ).toEqual([]);
    // At most the window's shared press listener, one for every control.
    expect(
      onWindow.mock.calls.filter(([type]) => type !== 'pointerdown'),
    ).toEqual([]);
    expect(
      onWindow.mock.calls.filter(([type]) => type === 'pointerdown').length,
    ).toBeLessThanOrEqual(1);
    unmount();
  });
});

describe('at a tap', () => {
  let elementsAtPoint: Element[];

  beforeEach(() => {
    // The band, and so the check, exists while the primary pointer is coarse.
    vi.spyOn(window, 'matchMedia').mockImplementation(coarse);
    elementsAtPoint = [];
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => elementsAtPoint),
    });
  });

  afterEach(() => {
    delete (document as {elementsFromPoint?: unknown}).elementsFromPoint;
  });

  function setUp() {
    const onA = vi.fn();
    const onB = vi.fn();
    render(
      <div data-testid="container">
        <Host id="a" onClick={onA} />
        <a href="#b" id="b" onClick={onB}>
          Neighbour
        </a>
      </div>,
    );
    const a = document.getElementById('a') as HTMLElement;
    const b = document.getElementById('b') as HTMLElement;
    const container = screen.getByTestId('container');
    // A 24 px control, and a link 4 px after it.
    a.getBoundingClientRect = () => rect(100, 100, 24, 24);
    b.getBoundingClientRect = () => rect(128, 100, 60, 24);
    return {a, b, container, onA, onB};
  }

  /** A finger's tap on `target` at (x, 112): its press, then its click. */
  function tap(target: Element, x: number, pointerType = 'touch'): boolean {
    const press = new Event('pointerdown', {bubbles: true});
    Object.assign(press, {pointerType, clientX: x, clientY: 112});
    target.dispatchEvent(press);
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    target.dispatchEvent(click);
    return click.defaultPrevented;
  }

  it('lets a tap inside the control act, and reads only the control', () => {
    const {a, onA} = setUp();
    const reads = vi.spyOn(a, 'getBoundingClientRect');
    expect(tap(a, 110)).toBe(false);
    expect(onA).toHaveBeenCalledTimes(1);
    expect(reads).toHaveBeenCalledTimes(1);
    expect(document.elementsFromPoint).not.toHaveBeenCalled();
  });

  it('lets a tap on the band act where no neighbour is under the finger', () => {
    const {a, container, onA} = setUp();
    // 6 px above the control: on its band only.
    elementsAtPoint = [a, container, document.body];
    const press = new Event('pointerdown', {bubbles: true});
    Object.assign(press, {pointerType: 'touch', clientX: 110, clientY: 94});
    a.dispatchEvent(press);
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    a.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(onA).toHaveBeenCalledTimes(1);
  });

  it('gives a tap on the band that lies on another target’s visible box to that target, as without the band', () => {
    const {a, b, container, onA, onB} = setUp();
    // 6 px past the control, 2 px inside the link: the link's box wins.
    elementsAtPoint = [a, b, container, document.body];
    expect(tap(a, 130)).toBe(true);
    expect(onA).not.toHaveBeenCalled();
    expect(onB).toHaveBeenCalledTimes(1);
    // One tap only: the next tap inside the control acts.
    expect(tap(a, 110)).toBe(false);
    expect(onA).toHaveBeenCalledTimes(1);
  });

  it('gives a tap in the empty gap to the candidate whose box is nearest the finger', () => {
    const {a, b, container, onA, onB} = setUp();
    // The control ends at 124 and the link starts at 128. Both bands lie over
    // the gap; the finger is on neither box.
    elementsAtPoint = [a, b, container, document.body];
    // 1 px before the link: the link's box is nearer.
    expect(tap(a, 127)).toBe(true);
    expect(onB).toHaveBeenCalledTimes(1);
    expect(onA).not.toHaveBeenCalled();
    // 1 px past the control: the control's box is nearer.
    expect(tap(a, 125)).toBe(false);
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).toHaveBeenCalledTimes(1);
  });

  it('measures a marked grown hit input, such as a switch’s, by its parent’s box', () => {
    const onA = vi.fn();
    const onSwitch = vi.fn();
    render(
      <div data-testid="container">
        <Host id="a" onClick={onA} />
        <span id="track">
          <input
            id="switch"
            type="checkbox"
            role="switch"
            aria-label="Sync"
            onClick={onSwitch}
            {...grownHitInputProps}
          />
        </span>
      </div>,
    );
    const a = document.getElementById('a') as HTMLElement;
    const track = document.getElementById('track') as HTMLElement;
    const input = document.getElementById('switch') as HTMLElement;
    const container = screen.getByTestId('container');
    // The control ends at 124; the switch's track starts at 128, and its
    // grown input reaches back to 118.
    a.getBoundingClientRect = () => rect(100, 100, 24, 24);
    track.getBoundingClientRect = () => rect(128, 104, 32, 16);
    input.getBoundingClientRect = () => rect(118, 90, 52, 44);
    elementsAtPoint = [a, input, track, container, document.body];
    // 1 px past the control, 3 px before the track: the control's tap.
    expect(tap(a, 125)).toBe(false);
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('measures an unmarked target by its own box, even when it reaches past its parent', () => {
    const onA = vi.fn();
    const onPin = vi.fn();
    render(
      <div data-testid="container">
        <Host id="a" onClick={onA} />
        <span id="holder">
          <button
            id="pin"
            type="button"
            onClick={onPin}
            style={{position: 'absolute'}}>
            Pin
          </button>
        </span>
      </div>,
    );
    const a = document.getElementById('a') as HTMLElement;
    const holder = document.getElementById('holder') as HTMLElement;
    const pin = document.getElementById('pin') as HTMLElement;
    const container = screen.getByTestId('container');
    // The control ends at 124. The pin's holder ends at 116, and the visible
    // pin reaches past it to 126.
    a.getBoundingClientRect = () => rect(100, 100, 24, 24);
    holder.getBoundingClientRect = () => rect(92, 100, 24, 24);
    pin.getBoundingClientRect = () => rect(102, 100, 24, 24);
    elementsAtPoint = [a, pin, holder, container, document.body];
    // The finger is on the pin's own box, under the control's band.
    const press = new Event('pointerdown', {bubbles: true});
    Object.assign(press, {pointerType: 'touch', clientX: 125, clientY: 112});
    a.dispatchEvent(press);
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    a.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(onPin).toHaveBeenCalledTimes(1);
    expect(onA).not.toHaveBeenCalled();
  });

  it('gives a tap on a field’s frame to its text entry, which takes the focus', () => {
    const onA = vi.fn();
    render(
      <div data-testid="container">
        <Host id="a" onClick={onA} />
        <div id="frame" {...fieldFrameProps}>
          <input id="entry" aria-label="Search" />
        </div>
      </div>,
    );
    const a = document.getElementById('a') as HTMLElement;
    const frame = document.getElementById('frame') as HTMLElement;
    const entry = document.getElementById('entry') as HTMLElement;
    const container = screen.getByTestId('container');
    // The control ends at 124; the field's frame starts at 128, its entry
    // at 136.
    a.getBoundingClientRect = () => rect(100, 100, 24, 24);
    frame.getBoundingClientRect = () => rect(128, 100, 120, 24);
    entry.getBoundingClientRect = () => rect(136, 104, 100, 16);
    elementsAtPoint = [a, frame, container, document.body];
    expect(tap(a, 130)).toBe(true);
    expect(onA).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(entry);
  });

  it('never gives a tap on a container’s own text to a checkbox the container holds', () => {
    const onA = vi.fn();
    const onBox = vi.fn();
    render(
      <div data-testid="container">
        <Host id="a" onClick={onA} />
        <div id="holder">
          <input id="box" type="checkbox" aria-label="Agree" onClick={onBox} />
          Terms and conditions
        </div>
      </div>,
    );
    const a = document.getElementById('a') as HTMLElement;
    const holder = document.getElementById('holder') as HTMLElement;
    const box = document.getElementById('box') as HTMLElement;
    const container = screen.getByTestId('container');
    a.getBoundingClientRect = () => rect(100, 100, 24, 24);
    holder.getBoundingClientRect = () => rect(128, 100, 160, 24);
    box.getBoundingClientRect = () => rect(260, 104, 16, 16);
    // On the holder's text, under the control's band: not a text entry.
    elementsAtPoint = [a, holder, container, document.body];
    expect(tap(a, 130)).toBe(false);
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onBox).not.toHaveBeenCalled();
  });

  it('gives a tap on a date field’s frame, whose entry sits inset in a slot, to the date entry: focus and picker', () => {
    const onA = vi.fn();
    render(
      <div data-testid="container">
        <Host id="a" onClick={onA} />
        <div id="frame" {...fieldFrameProps}>
          <button type="button" tabIndex={-1} aria-label="Open calendar" />
          <span id="slot">
            <input id="day" type="date" aria-label="Pick" />
          </span>
        </div>
      </div>,
    );
    const a = document.getElementById('a') as HTMLElement;
    const frame = document.getElementById('frame') as HTMLElement;
    const day = document.getElementById('day') as HTMLInputElement;
    const showPicker = vi.fn();
    day.showPicker = showPicker;
    const container = screen.getByTestId('container');
    // The control ends at 124; the field's frame starts at 128, and its
    // entry sits 10 px inside it.
    a.getBoundingClientRect = () => rect(100, 100, 24, 24);
    frame.getBoundingClientRect = () => rect(128, 100, 140, 24);
    day.getBoundingClientRect = () => rect(160, 104, 98, 16);
    elementsAtPoint = [a, frame, container, document.body];
    expect(tap(a, 130)).toBe(true);
    expect(onA).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(day);
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('gives a tap on a select under the band to the select: focus and picker', () => {
    const onA = vi.fn();
    render(
      <div data-testid="container">
        <Host id="a" onClick={onA} />
        <select id="size" aria-label="Size">
          <option>S</option>
          <option>M</option>
        </select>
      </div>,
    );
    const a = document.getElementById('a') as HTMLElement;
    const size = document.getElementById('size') as HTMLSelectElement;
    const showPicker = vi.fn();
    size.showPicker = showPicker;
    const container = screen.getByTestId('container');
    a.getBoundingClientRect = () => rect(100, 100, 24, 24);
    size.getBoundingClientRect = () => rect(128, 100, 80, 24);
    elementsAtPoint = [a, size, container, document.body];
    expect(tap(a, 130)).toBe(true);
    expect(onA).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(size);
    expect(showPicker).toHaveBeenCalledTimes(1);
  });

  it('gives a tap on a field root’s status message or beside its frame to the band’s control, and a tap inside the frame to the field', () => {
    const onA = vi.fn();
    render(
      <div data-testid="container">
        <Host id="a" onClick={onA} />
        <div id="root">
          <label htmlFor="entry">Search</label>
          <div id="frame" {...fieldFrameProps}>
            <input id="entry" />
          </div>
          <span id="status">Required</span>
        </div>
      </div>,
    );
    const a = document.getElementById('a') as HTMLElement;
    const root = document.getElementById('root') as HTMLElement;
    const frame = document.getElementById('frame') as HTMLElement;
    const entry = document.getElementById('entry') as HTMLElement;
    const status = document.getElementById('status') as HTMLElement;
    const container = screen.getByTestId('container');
    a.getBoundingClientRect = () => rect(100, 100, 24, 24);
    root.getBoundingClientRect = () => rect(128, 80, 200, 64);
    frame.getBoundingClientRect = () => rect(140, 100, 160, 24);
    entry.getBoundingClientRect = () => rect(148, 104, 144, 16);
    status.getBoundingClientRect = () => rect(128, 126, 80, 16);
    // On the status message, under the control's band: empty space.
    elementsAtPoint = [a, status, root, container, document.body];
    expect(tap(a, 130)).toBe(false);
    // Beside the frame, on the root's own box: empty space.
    elementsAtPoint = [a, root, container, document.body];
    expect(tap(a, 132)).toBe(false);
    expect(onA).toHaveBeenCalledTimes(2);
    expect(document.activeElement).not.toBe(entry);
    // Inside the marked frame, on its padding: the field's.
    elementsAtPoint = [a, frame, root, container, document.body];
    expect(tap(a, 142)).toBe(true);
    expect(onA).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(entry);
  });

  it('checks a pen tap and a mouse click on the band too, while the primary pointer is coarse', () => {
    const {a, b, container, onA, onB} = setUp();
    // 6 px past the control, 2 px inside the link: the link's box wins.
    elementsAtPoint = [a, b, container, document.body];
    expect(tap(a, 130, 'pen')).toBe(true);
    expect(tap(a, 130, 'mouse')).toBe(true);
    expect(onA).not.toHaveBeenCalled();
    expect(onB).toHaveBeenCalledTimes(2);
  });

  it('gives a tap on a Typeahead’s frame to its entry, which takes the focus', () => {
    const onA = vi.fn();
    render(
      <div data-testid="container">
        <Host id="a" onClick={onA} />
        <Typeahead
          label="Fruit"
          isLabelHidden
          searchSource={{search: () => [], bootstrap: () => []}}
          value={null}
          onChange={() => {}}
        />
      </div>,
    );
    const a = document.getElementById('a') as HTMLElement;
    const entry = screen.getByRole('combobox', {name: 'Fruit'});
    const frame = entry.closest('[data-astryx-field-frame]') as HTMLElement;
    expect(frame).not.toBeNull();
    const container = screen.getByTestId('container');
    a.getBoundingClientRect = () => rect(100, 100, 24, 24);
    frame.getBoundingClientRect = () => rect(128, 100, 160, 32);
    entry.getBoundingClientRect = () => rect(140, 104, 136, 24);
    elementsAtPoint = [a, frame, container, document.body];
    expect(tap(a, 130)).toBe(true);
    expect(onA).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(entry);
  });

  it('gives a tap on a marked box that holds no entry, such as a field’s description, to that box’s own click', () => {
    const onA = vi.fn();
    const onDescription = vi.fn();
    render(
      <div data-testid="container">
        <Host id="a" onClick={onA} />
        <span id="description" onClick={onDescription} {...fieldFrameProps}>
          As on your passport
        </span>
      </div>,
    );
    const a = document.getElementById('a') as HTMLElement;
    const description = document.getElementById('description') as HTMLElement;
    const container = screen.getByTestId('container');
    a.getBoundingClientRect = () => rect(100, 100, 24, 24);
    description.getBoundingClientRect = () => rect(128, 100, 140, 16);
    elementsAtPoint = [a, description, container, document.body];
    expect(tap(a, 130)).toBe(true);
    expect(onA).not.toHaveBeenCalled();
    expect(onDescription).toHaveBeenCalledTimes(1);
  });

  it('stops at the control’s own container: what paints below it, such as the page under a layer, is not beside it', () => {
    const {a, b, container, onA} = setUp();
    elementsAtPoint = [a, container, b, document.body];
    expect(tap(a, 130)).toBe(false);
    expect(onA).toHaveBeenCalledTimes(1);
  });

  it('leaves a finger, a pen and a mouse under a fine pointer, and a keyboard click after a touch, alone', () => {
    const {a, b, container, onA} = setUp();
    elementsAtPoint = [a, b, container, document.body];
    vi.mocked(window.matchMedia).mockImplementation(media => ({
      ...coarse(media),
      matches: false,
    }));
    expect(tap(a, 130, 'touch')).toBe(false);
    expect(tap(a, 130, 'pen')).toBe(false);
    expect(tap(a, 130, 'mouse')).toBe(false);
    expect(onA).toHaveBeenCalledTimes(3);
    vi.mocked(window.matchMedia).mockImplementation(coarse);
    const press = new Event('pointerdown', {bubbles: true});
    Object.assign(press, {pointerType: 'touch', clientX: 130, clientY: 112});
    a.dispatchEvent(press);
    const key = new MouseEvent('click', {bubbles: true, cancelable: true});
    a.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    expect(onA).toHaveBeenCalledTimes(4);
  });
});

interface Declared {
  readonly selector: string;
  readonly media: string | null;
  readonly value: string;
}

/** The values `property` takes in the injected rules for `el`'s classes. */
function declared(el: Element, property: string): Declared[] {
  const classes = [...el.classList].map(name => `.${name}`);
  const out: Declared[] = [];
  const walk = (rules: CSSRuleList, media: string | null) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, rule.media.mediaText);
      } else if (
        rule instanceof CSSStyleRule &&
        classes.some(name => rule.selectorText.startsWith(name))
      ) {
        const value = rule.style.getPropertyValue(property);
        if (value !== '') {
          out.push({selector: rule.selectorText, media, value: value.trim()});
        }
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    walk(sheet.cssRules, null);
  }
  return out;
}

describe('the band', () => {
  it('reads a separate room on each side, so one side can stop while the others grow', () => {
    render(<Host id="lone" />);
    const lone = document.getElementById('lone') as HTMLElement;
    // StyleX writes the block sides as top and bottom.
    for (const [property, side] of [
      ['top', 'block-start'],
      ['bottom', 'block-end'],
      ['inset-inline-start', 'inline-start'],
      ['inset-inline-end', 'inline-end'],
    ]) {
      const [band] = declared(lone, property);
      expect(band.media).toBe('(pointer: coarse)');
      expect(band.selector).toMatch(/::after$/);
      expect(band.value).toContain(`var(--_hit-room-${side})`);
    }
    // The block room yields to a row's end slot (rowEnd).
    for (const [side, room] of [
      ['block-start', 'var(--_hit-row-block,22px)'],
      ['block-end', 'var(--_hit-row-block,22px)'],
      ['inline-start', '22px'],
      ['inline-end', '22px'],
    ]) {
      expect(declared(lone, `--_hit-room-${side}`)).toEqual([
        expect.objectContaining({value: room}),
      ]);
    }
  });

  it('gives a group’s members half its gap between them, and its end members their full room outward', () => {
    render(
      <ButtonGroup label="Edit">
        <Button label="Cut" />
        <Button label="Copy" />
        <Button label="Paste" />
      </ButtonGroup>,
    );
    const group = screen.getByRole('group');
    const cut = screen.getByRole('button', {name: 'Cut'});
    // A connected group has no gap: no room between its members.
    expect(declared(group, '--_hit-group-inline')).toEqual([
      expect.objectContaining({value: '0px'}),
    ]);
    const start = declared(cut, '--_hit-room-inline-start');
    expect(start).toContainEqual(
      expect.objectContaining({value: 'var(--_hit-group-inline)'}),
    );
    expect(start).toContainEqual(
      expect.objectContaining({
        selector: expect.stringMatching(/:first-child$/),
        value: '22px',
      }),
    );
    // jsdom refuses the last-member rule (internal/test-utils), so only its
    // room between members is read here. The browser spec checks the end.
    expect(declared(cut, '--_hit-room-inline-end')).toContainEqual(
      expect.objectContaining({value: 'var(--_hit-group-inline)'}),
    );
  });

  it('keeps an InfoTip from growing sideways: it sits in running text', () => {
    render(<InfoTip content="Billed monthly per seat" label="Pricing help" />);
    const tip = screen.getByRole('button', {name: 'Pricing help'});
    const room = (side: string) =>
      declared(tip, `--_hit-room-${side}`).map(({value}) => value);
    expect(room('inline-start')).toContain('0px');
    expect(room('inline-end')).toContain('0px');
    expect(room('block-start')).toEqual(['var(--_hit-row-block,22px)']);
  });

  it('gives a control in a List row’s end slot no block room: the row takes the taps above and below it', () => {
    render(
      <List>
        <ListItem
          label="Network"
          endContent={<Button label="Forget" onClick={() => {}} />}
        />
      </List>,
    );
    const forget = screen.getByRole('button', {name: 'Forget'});
    const slot = forget.parentElement as HTMLElement;
    expect(declared(slot, '--_hit-row-block').map(({value}) => value)).toEqual([
      '0px',
    ]);
    expect(
      declared(forget, '--_hit-room-block-start').map(({value}) => value),
    ).toContain('var(--_hit-row-block,22px)');
  });
});
