// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonA11y.stories.tsx
 * @input Uses BUTTON_BINDING_STATES and BUTTON_PATTERN_EXCLUSIONS from the
 *   shared button-pattern binding inventory
 * @output One story per state in that inventory, each counting its own
 *   activations.
 * @position The reproduction path for the Chromium half of the button-pattern
 *   contract (`docs/specs/AST-009/spec.md` FR30: a browser claim is checked
 *   against a checked-in story, not a page a test builds and throws away).
 *
 * Every story body is `storyFor('<state id>')`. What each state IS lives in the
 * inventory beside its facts, not here — one definition, rendered identically
 * by the jsdom lane and by this story, so the two lanes cannot drift into
 * testing different things under the same name.
 *
 * The activation count is both visible text and a `data-a11y-activations`
 * attribute: a person reading the story and the test reading the DOM see the
 * same number. A button's action leaves no trace on the button, so counting the
 * handler is the only honest way to ask whether pressing it did anything.
 *
 * SYNC: A new row in Button.a11y.states.ts needs a named export here. Nothing
 *   at compile time catches a missing or renamed one — the Chromium binding
 *   does, when it navigates to the row's `storyId` and finds no story.
 */

import {useState, type ReactNode} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
// Relative, not `@astryxdesign/core/…`: the package specifier would claim these
// are published entry points, and they are deliberately not — `__tests__` is
// excluded from the build and ships in no `dist`. A repo-private path says what
// this actually is, and matches how other stories reach package internals.
import {
  BUTTON_BINDING_STATES,
  BUTTON_PATTERN_EXCLUSIONS,
} from '../../../packages/core/src/Button/__tests__/Button.a11y.states';
import {
  BUTTON_EXCLUSION_RENDERS,
  BUTTON_STATE_RENDERS,
} from '../../../packages/core/src/Button/__tests__/Button.a11y.renders';

/** Render one control and count how many times its action ran. */
function Counted({
  children,
}: {
  children: (activate: () => void) => ReactNode;
}): ReactNode {
  const [count, setCount] = useState(0);
  return (
    <div data-a11y-activations={count}>
      {children(() => {
        setCount(current => current + 1);
      })}
      <p>
        activations: <output>{count}</output>
      </p>
    </div>
  );
}

function storyFor(id: string): StoryObj {
  const state = BUTTON_BINDING_STATES.find(candidate => candidate.id === id);
  if (state == null) {
    throw new Error(`no binding state "${id}" — see Button.a11y.states.ts`);
  }
  return {
    name: `${state.binding} — ${state.id}`,
    render: () => (
      <Counted>{activate => BUTTON_STATE_RENDERS[state.id](activate)}</Counted>
    ),
  };
}

/** An excluded part, rendered so its exclusion can be checked in a browser. */
function exclusionStory(id: string): StoryObj {
  const exclusion = BUTTON_PATTERN_EXCLUSIONS.find(
    candidate => candidate.id === id,
  );
  if (exclusion == null) {
    throw new Error(`no exclusion "${id}" — see Button.a11y.states.ts`);
  }
  return {
    name: `excluded — ${exclusion.id}`,
    render: () => (
      <Counted>
        {activate => BUTTON_EXCLUSION_RENDERS[exclusion.id](activate)}
      </Counted>
    ),
  };
}

const meta: Meta = {
  title: 'a11y/Button pattern',
  // `no-visual` is the visual gate's supported explicit exclusion, and these
  // fixtures are what it is for: they exist to be DRIVEN by the accessibility
  // contract, not to be photographed. Several deliberately render a state no
  // product ships — a disabled card, a button mid-action — so a baseline frame
  // would be a picture nobody reviews, and a diff on one would ask a question
  // nobody can answer. Excluding them costs no coverage: every one of these
  // stories is still driven, in a real browser, by the Chromium contract lane.
  tags: ['no-visual'],
  parameters: {
    docs: {
      description: {
        component:
          'Binding states for the shared button-pattern accessibility contract. Each story counts its own activations, because a button leaves no trace of having been pressed.',
      },
    },
  },
};

export default meta;

export const ButtonText = storyFor('button-text');
export const ButtonIconOnly = storyFor('button-icon-only');
export const ButtonComposedLabel = storyFor('button-composed-label');
export const ButtonDisabled = storyFor('button-disabled');
export const ButtonDisabledWithTooltip = storyFor(
  'button-disabled-with-tooltip',
);
export const ButtonLoading = storyFor('button-loading');

export const IconButtonDefault = storyFor('icon-button');
export const IconButtonDisabled = storyFor('icon-button-disabled');
export const IconButtonLoading = storyFor('icon-button-loading');

export const ClickableCardDefault = storyFor('clickable-card');
export const ClickableCardDisabled = storyFor('clickable-card-disabled');

export const SidenavCollapseIcon = storyFor('sidenav-collapse-icon');
export const SidenavCollapseLabelled = storyFor('sidenav-collapse-labelled');

export const ChatSend = storyFor('chat-send');
export const ChatSendDisabled = storyFor('chat-send-disabled');
export const ChatSendStop = storyFor('chat-send-stop');

export const ButtonAsLink = exclusionStory('button-as-link');
export const ClickableCardAsLink = exclusionStory('clickable-card-as-link');
