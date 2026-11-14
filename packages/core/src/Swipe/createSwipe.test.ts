// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file createSwipe.test.ts
 * @input createSwipe and the reader of its values
 * @output Checks the constructor: an opaque, frozen value made only by
 *   createSwipe. The value carries the declared entries and `swipeBehavior`
 *   (default `reveal`). A committing side with more than one entry gets a
 *   development warning. Checks the runtime it carries too: it decides which
 *   rows it serves from the facts a row hands it. It serves every row and every
 *   value with the same layer type and root handlers
 * @position Unit tests of packages/core/src/Swipe/createSwipe.ts
 */

import {isValidElement} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createSwipe} from './createSwipe';
import {swipeHostOf, type Swipe} from './swipeHost';

const archive = {id: 'archive', label: 'Archive', onActivate: () => {}};
const remove = {
  id: 'delete',
  label: 'Delete',
  onActivate: () => {},
  hasRemoval: true,
};

describe('createSwipe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makes an opaque, frozen value: nothing in it for a caller to read', () => {
    const swipe = createSwipe({trailing: [archive]});
    expect(Object.isFrozen(swipe)).toBe(true);
    expect(Object.keys(swipe)).toEqual([]);
    expect(createSwipe({trailing: [archive]})).not.toBe(swipe);
  });

  it('carries the entries per side and swipeBehavior, reveal by default', () => {
    const host = swipeHostOf(
      createSwipe({leading: [archive], trailing: [archive, remove]}),
    );
    expect(host?.leading).toEqual([archive]);
    expect(host?.trailing).toEqual([archive, remove]);
    expect(host?.behavior).toBe('reveal');
    expect(
      swipeHostOf(createSwipe({trailing: [archive], swipeBehavior: 'commit'}))
        ?.behavior,
    ).toBe('commit');
    expect(swipeHostOf(createSwipe({}))?.leading).toEqual([]);
  });

  it('keeps the entries it was given, whatever the caller does with its arrays after', () => {
    const trailing = [archive];
    const host = swipeHostOf(createSwipe({trailing}));
    trailing.push(remove);
    expect(host?.trailing).toEqual([archive]);
  });

  it('is the only maker of a Swipe value', () => {
    // @ts-expect-error A Swipe value comes only from createSwipe.
    const typed: Swipe = {trailing: [archive]};
    expect(swipeHostOf(typed)).toBeNull();
    expect(swipeHostOf({})).toBeNull();
  });

  describe('the runtime a row hands its root to', () => {
    const row = {
      role: undefined,
      isDisabled: false,
      isDelegate: false,
      isLinkRoot: false,
    };

    it('serves a role-less row and a listitem, and not a row whose role forbids interactive descendants (spec:AST-057 DEC-3)', () => {
      const host = swipeHostOf(createSwipe({trailing: [archive]}));
      expect(host?.attach(row)).not.toBeNull();
      expect(host?.attach({...row, role: 'listitem'})).not.toBeNull();
      for (const role of [
        'option',
        'menuitem',
        'menuitemcheckbox',
        'menuitemradio',
      ]) {
        expect(host?.attach({...row, role})).toBeNull();
      }
    });

    it('serves no disabled row, no row that is the enlarged target of a control inside it, and no root that is a link', () => {
      const host = swipeHostOf(createSwipe({trailing: [archive]}));
      expect(host?.attach({...row, isDisabled: true})).toBeNull();
      expect(host?.attach({...row, isDelegate: true})).toBeNull();
      expect(host?.attach({...row, isLinkRoot: true})).toBeNull();
    });

    it('serves no row when no side has an entry', () => {
      expect(swipeHostOf(createSwipe({}))?.attach(row)).toBeNull();
      expect(
        swipeHostOf(createSwipe({leading: [], trailing: []}))?.attach(row),
      ).toBeNull();
    });

    it('gives every row and every value the same root style and layer type, so a new value changes nothing on the root (spec:AST-057 FR11)', () => {
      const first = swipeHostOf(createSwipe({trailing: [archive]}))?.attach(
        row,
      );
      const second = swipeHostOf(
        createSwipe({leading: [archive], swipeBehavior: 'commit'}),
      )?.attach(row);
      expect(second?.rootStyle).toBe(first?.rootStyle);
      expect(isValidElement(first?.layer)).toBe(true);
      expect(isValidElement(second?.layer)).toBe(true);
      if (isValidElement(first?.layer) && isValidElement(second?.layer)) {
        expect(second.layer.type).toBe(first.layer.type);
        expect(second.layer.props).toMatchObject({
          leading: [archive],
          trailing: [],
          behavior: 'commit',
        });
      }
    });
  });

  it('warns in development when a committing side has more than one entry', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createSwipe({trailing: [archive], swipeBehavior: 'commit'});
    createSwipe({trailing: [archive, remove]});
    expect(warn).not.toHaveBeenCalled();
    createSwipe({trailing: [archive, remove], swipeBehavior: 'commit'});
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("swipeBehavior: 'commit'"),
    );
  });
});

describe('a swizzled copy of the swipe module', () => {
  it('finds the host of a Swipe value the package made, and the package finds its own', async () => {
    const swipe = createSwipe({
      trailing: [{id: 'archive', label: 'Archive', onActivate: () => {}}],
    });
    vi.resetModules();
    const copy = await import('./swipeHost');
    expect(copy.swipeHostOf).not.toBe(swipeHostOf);
    expect(copy.swipeHostOf(swipe)).toBe(swipeHostOf(swipe));
    expect(copy.swipeHostOf(swipe)).not.toBeNull();
    // A value built by hand has no host in any copy.
    expect(copy.swipeHostOf(Object.freeze({}))).toBeNull();
  });
});

describe('the ids a swipe carries in its type (spec:AST-057 FR1)', () => {
  it('infers its actions’ ids as literals, and rejects an unknown id, a handler for fewer ids and an action with no id', () => {
    const noop = () => {};
    const mail = createSwipe({
      trailing: [
        {id: 'archive', label: 'Archive', onActivate: noop},
        {id: 'delete', label: 'Delete', onActivate: noop},
      ],
    });
    const typed: Swipe<'archive' | 'delete'> = mail;
    // @ts-expect-error The swipe has no 'delte' action.
    const misspelt: Swipe<'archive' | 'delte'> = mail;
    createSwipe({
      trailing: [
        {
          id: 'archive',
          label: 'Archive',
          onActivate: ({id}) => {
            // @ts-expect-error An id the swipe does not have never matches.
            expect(id === 'achive').toBe(false);
          },
        },
      ],
    });
    const archiveOnly = (event: {
      id: 'archive';
      itemKey: string | number | undefined;
    }) => event;
    createSwipe({
      trailing: [
        {id: 'archive', label: 'Archive', onActivate: noop},
        // @ts-expect-error This handler takes fewer ids than the swipe has.
        {id: 'delete', label: 'Delete', onActivate: archiveOnly},
      ],
    });
    // @ts-expect-error An action needs an id.
    createSwipe({trailing: [{label: 'Archive', onActivate: noop}]});
    expect([typed, misspelt]).toHaveLength(2);
  });
});
