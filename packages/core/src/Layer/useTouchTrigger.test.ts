// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTouchTrigger.test.ts
 * @input Uses vitest, Testing Library, isActionTrigger,
 *   tapLandsOnDisabledControl, useTapStop
 * @output Unit tests for the action rules behind touchTrigger="auto" (the
 *   trigger's own action, and a tap that lands in a disabled control) and for
 *   the tap stop a reveal-only trigger uses
 * @position Testing; validates useTouchTrigger.ts implementation
 *
 * SYNC: When useTouchTrigger.ts changes, update tests to match new behavior
 *
 * The tap-versus-suppress decision rests entirely on this predicate, and it is
 * the part a new element type silently falls through. The per-component tests
 * (Tooltip.test.tsx, HoverCard.test.tsx) cover the gestures it feeds.
 */

import {createElement} from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import {describe, it, expect} from 'vitest';
import {
  isActionTrigger,
  tapLandsOnDisabledControl,
  useTapStop,
} from './useTouchTrigger';

function element(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
}

describe('isActionTrigger', () => {
  it.each([
    ['<button type="button">Save</button>'],
    ['<input type="text" />'],
    ['<select></select>'],
    ['<textarea></textarea>'],
    ['<summary>More</summary>'],
    ['<label>Name</label>'],
    ['<a href="/somewhere">Link</a>'],
  ])('treats %s as an action', html => {
    expect(isActionTrigger(element(html))).toBe(true);
  });

  it.each([
    ['<span>Plain text</span>'],
    ['<svg></svg>'],
    ['<abbr title="what">WCAG</abbr>'],
    // An anchor without href is a link that goes nowhere.
    ['<a>Not a link</a>'],
  ])('treats %s as inert', html => {
    expect(isActionTrigger(element(html))).toBe(false);
  });

  it('reads an explicit role over the tag it sits on', () => {
    expect(isActionTrigger(element('<span role="button">Go</span>'))).toBe(
      true,
    );
    // Scenery: the role says this button is not the control it looks like.
    expect(
      isActionTrigger(element('<button role="presentation">x</button>')),
    ).toBe(false);
  });

  it('does not treat mere focusability as an action', () => {
    // The wrapper a text-only Tooltip renders: reachable by keyboard so the
    // hint is not mouse-only, and it still does nothing when activated.
    expect(isActionTrigger(element('<span tabindex="0">Term</span>'))).toBe(
      false,
    );
  });

  it('treats a contenteditable surface as an action', () => {
    const editable = element('<div contenteditable="true"></div>');
    expect(isActionTrigger(editable)).toBe(true);
  });
});

describe('useTapStop', () => {
  function ClickStopTrigger() {
    return createElement('span', {...useTapStop('click')}, 'trigger');
  }
  function MouseDownStopTrigger() {
    return createElement('span', {...useTapStop('mousedown')}, 'trigger');
  }

  it.each(['touch', 'pen'])(
    'cancels the click that follows a %s press, and only that one',
    pointerType => {
      render(createElement(ClickStopTrigger));
      const trigger = screen.getByText('trigger');
      fireEvent.pointerDown(trigger, {pointerType});
      // fireEvent returns false when the event's default was prevented.
      expect(fireEvent.click(trigger)).toBe(false);
      // The stop belongs to that press: a click with no new press keeps its
      // default.
      expect(fireEvent.click(trigger)).toBe(true);
    },
  );

  it('cancels the mouse press that follows a finger press', () => {
    render(createElement(MouseDownStopTrigger));
    const trigger = screen.getByText('trigger');
    fireEvent.pointerDown(trigger, {pointerType: 'touch'});
    expect(fireEvent.mouseDown(trigger)).toBe(false);
    // The click itself still goes through, so the layer can open.
    expect(fireEvent.click(trigger)).toBe(true);
  });

  it('leaves a mouse press and its click alone', () => {
    render(createElement(ClickStopTrigger));
    const trigger = screen.getByText('trigger');
    fireEvent.pointerDown(trigger, {pointerType: 'mouse'});
    expect(fireEvent.click(trigger)).toBe(true);
  });
});

describe('isActionTrigger: a disabled control', () => {
  it.each([
    ['<button type="button" aria-disabled="true">Publish</button>'],
    ['<button type="button" disabled>Publish</button>'],
    ['<a href="/archive" aria-disabled="true">Archive</a>'],
    ['<div role="menuitem" aria-disabled="true">Delete</div>'],
    ['<input type="checkbox" role="switch" aria-disabled="true" />'],
  ])('is no action: %s', html => {
    const host = document.createElement('div');
    host.innerHTML = html;
    expect(isActionTrigger(host.firstElementChild as HTMLElement)).toBe(false);
  });

  it('makes the label around it no action', () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<label><input type="checkbox" aria-disabled="true" /> Notify</label>';
    document.body.append(host);
    expect(isActionTrigger(host.querySelector('label') as HTMLElement)).toBe(
      false,
    );
    host.remove();
  });
});

/** The element a tap lands on: the one marked `data-tapped`, else the trigger. */
function tappedIn(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  return (host.querySelector('[data-tapped]') ??
    host.querySelector('[data-trigger]')) as HTMLElement;
}

describe('tapLandsOnDisabledControl', () => {
  it.each([
    // The disabled control itself, or the icon or label inside it.
    ['<button type="button" aria-disabled="true" data-tapped>Publish</button>'],
    ['<button type="button" disabled data-tapped>Publish</button>'],
    [
      '<button type="button" aria-disabled="true"><svg data-tapped></svg></button>',
    ],
    [
      '<div role="menuitem" aria-disabled="true"><span data-tapped>Delete</span></div>',
    ],
    // A disabled field inside a clickable card: the field is innermost.
    [
      '<div data-pressable-container="true"><span><input aria-disabled="true" data-tapped /></span></div>',
    ],
    // A label for a disabled control.
    [
      '<label><input type="checkbox" aria-disabled="true" /><span data-tapped>Notify</span></label>',
    ],
    // A clickable container that is itself aria-disabled.
    [
      '<div data-pressable-container="true" aria-disabled="true"><span data-tapped>Owner</span></div>',
    ],
  ])('takes the tap itself: %s', html => {
    expect(tapLandsOnDisabledControl(tappedIn(html))).toBe(true);
  });

  it.each([
    // An enabled control, also around the tapped text: left to the trigger.
    ['<a href="/doc"><span data-tapped>A very long title</span></a>'],
    ['<button type="button"><span data-tapped>Label</span></button>'],
    ['<label><input type="checkbox" /><span data-tapped>Notify</span></label>'],
    ['<div data-pressable-container="true"><span data-tapped>ID</span></div>'],
    // An enabled control inside a disabled container is innermost.
    [
      '<div data-pressable-container="true" aria-disabled="true"><a href="/doc" data-tapped>Doc</a></div>',
    ],
    // A clickable container that only takes no click (a default Overlay's
    // mark) is no disabled control.
    [
      '<div data-pressable-container="true"><span data-tapped>Caption</span></div>',
    ],
    // No control at all.
    ['<p>Read the <span data-tapped>WCAG</span> notes.</p>'],
  ])('leaves the tap to the trigger: %s', html => {
    expect(tapLandsOnDisabledControl(tappedIn(html))).toBe(false);
  });
});
