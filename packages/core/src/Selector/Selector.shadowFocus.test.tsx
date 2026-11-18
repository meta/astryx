// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.shadowFocus.test.tsx
 * @input Uses vitest, @testing-library/react, @testing-library/user-event
 * @output Unit tests for focus return when a Selector or MultiSelector lives
 *   inside a shadow root
 * @position Tests; validates the close path in useSelectorPresentation.ts
 */

import {act, cleanup, render, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {ReactElement} from 'react';
import {describe, expect, it} from 'vitest';
import {Selector} from './Selector';
import {MultiSelector} from '../MultiSelector/MultiSelector';

const OPTIONS = ['Apple', 'Banana', 'Cherry'];

/**
 * Renders `ui` in a container that is no Tab stop, inside an open shadow
 * root, opens the list, focuses the container as a press on it would, and
 * closes the list by light dismiss. Returns the root and the trigger.
 */
async function pressContainerInShadowRoot(ui: ReactElement) {
  const user = userEvent.setup();
  const host = document.createElement('div');
  document.body.append(host);
  const shadow = host.attachShadow({mode: 'open'});
  const container = document.createElement('div');
  container.tabIndex = -1;
  shadow.append(container);
  render(ui, {container});
  const trigger = within(container).getByRole('combobox');
  await user.click(trigger);
  act(() => {
    container.focus();
  });
  const popover = shadow.querySelector('[popover]') as HTMLElement;
  act(() => {
    popover.dispatchEvent(
      Object.assign(new Event('toggle'), {
        oldState: 'open',
        newState: 'closed',
      }),
    );
  });
  return {host, shadow, trigger};
}

/**
 * Renders `ui` inside an open shadow root whose host sits in a container that
 * is no Tab stop, outside the root. Opens the list, focuses that outer
 * container as a press on it would, and closes the list by light dismiss.
 */
async function pressContainerAroundHost(ui: ReactElement) {
  const user = userEvent.setup();
  const outer = document.createElement('div');
  outer.tabIndex = -1;
  document.body.append(outer);
  const host = document.createElement('div');
  outer.append(host);
  const shadow = host.attachShadow({mode: 'open'});
  const container = document.createElement('div');
  shadow.append(container);
  render(ui, {container});
  const trigger = within(container).getByRole('combobox');
  await user.click(trigger);
  act(() => {
    outer.focus();
  });
  const popover = shadow.querySelector('[popover]') as HTMLElement;
  act(() => {
    popover.dispatchEvent(
      Object.assign(new Event('toggle'), {
        oldState: 'open',
        newState: 'closed',
      }),
    );
  });
  return {outer, shadow, trigger};
}

describe('focus return inside a shadow root', () => {
  it('Selector: a press on a container around the list that is no Tab stop returns focus to the trigger', async () => {
    const {host, shadow, trigger} = await pressContainerInShadowRoot(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Banana"
        onChange={() => {}}
        placement="below"
      />,
    );
    try {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(shadow.activeElement).toBe(trigger);
    } finally {
      cleanup();
      host.remove();
    }
  });

  it('MultiSelector: a press on a container around the list that is no Tab stop returns focus to the trigger', async () => {
    const {host, shadow, trigger} = await pressContainerInShadowRoot(
      <MultiSelector
        label="Fruit"
        options={OPTIONS}
        value={['Banana']}
        onChange={() => {}}
      />,
    );
    try {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(shadow.activeElement).toBe(trigger);
    } finally {
      cleanup();
      host.remove();
    }
  });

  it('Selector: a press on a container around the shadow host that is no Tab stop returns focus to the trigger', async () => {
    const {outer, shadow, trigger} = await pressContainerAroundHost(
      <Selector
        label="Fruit"
        options={OPTIONS}
        value="Banana"
        onChange={() => {}}
        placement="below"
      />,
    );
    try {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(shadow.activeElement).toBe(trigger);
    } finally {
      cleanup();
      outer.remove();
    }
  });

  it('MultiSelector: a press on a container around the shadow host that is no Tab stop returns focus to the trigger', async () => {
    const {outer, shadow, trigger} = await pressContainerAroundHost(
      <MultiSelector
        label="Fruit"
        options={OPTIONS}
        value={['Banana']}
        onChange={() => {}}
      />,
    );
    try {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(shadow.activeElement).toBe(trigger);
    } finally {
      cleanup();
      outer.remove();
    }
  });

  it('Selector: inside a closed shadow root, a press on another field keeps focus on that field', async () => {
    const user = userEvent.setup();
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({mode: 'closed'});
    const container = document.createElement('div');
    shadow.append(container);
    const field = document.createElement('input');
    field.setAttribute('aria-label', 'Other field');
    shadow.append(field);
    try {
      render(
        <Selector
          label="Fruit"
          options={OPTIONS}
          value="Banana"
          onChange={() => {}}
          placement="below"
        />,
        {container},
      );
      const trigger = within(container).getByRole('combobox');
      await user.click(trigger);
      act(() => {
        field.focus();
      });
      const popover = shadow.querySelector('[popover]') as HTMLElement;
      act(() => {
        popover.dispatchEvent(
          Object.assign(new Event('toggle'), {
            oldState: 'open',
            newState: 'closed',
          }),
        );
      });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(shadow.activeElement).toBe(field);
    } finally {
      cleanup();
      host.remove();
    }
  });
});
