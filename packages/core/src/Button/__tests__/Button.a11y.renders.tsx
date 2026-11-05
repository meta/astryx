// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Button.a11y.renders.tsx
 * @input Uses the five components that adopt the button pattern, and the id
 *   unions from ./Button.a11y.states
 * @output BUTTON_STATE_RENDERS and BUTTON_EXCLUSION_RENDERS — how each row of
 *   the binding inventory is rendered.
 * @position One definition of what each state IS, shared by the jsdom lane and
 *   by the Storybook story for the same state, so the two cannot drift into
 *   testing different things under the same name.
 *
 * Split from the inventory because that file must stay importable from
 * Playwright's plain Node runtime, which applies no StyleX transform, and
 * importing a component there would break the browser lane before it started.
 * The split costs nothing in drift: both maps are keyed by an id union, so a
 * state without a rendering does not compile.
 *
 * `activate` stands in for whatever handler a consumer would pass, and every
 * lane counts how many times it runs — a button's action leaves no trace on the
 * button, so counting the handler is the only honest way to ask whether
 * pressing it did anything.
 */

import type {ReactNode} from 'react';
import {TrashIcon} from '@heroicons/react/24/outline';
import {Button} from '../Button';
import {IconButton} from '../../IconButton/IconButton';
import {ClickableCard} from '../../ClickableCard/ClickableCard';
import {ChatSendButton} from '../../Chat/ChatSendButton';
import {CollapseHarness} from './Button.a11y.harnesses';
import type {ButtonExclusionId, ButtonStateId} from './Button.a11y.states';

export type StateRender = (activate: () => void) => ReactNode;

export const BUTTON_STATE_RENDERS: Record<ButtonStateId, StateRender> = {
  'button-text': activate => <Button label="Save changes" onClick={activate} />,
  'button-icon-only': activate => (
    <Button
      label="Delete conversation"
      isIconOnly
      icon={<TrashIcon />}
      onClick={activate}
    />
  ),
  'button-composed-label': activate => (
    <Button label="Save changes" onClick={activate}>
      Save changes
    </Button>
  ),
  'button-disabled': activate => (
    <Button label="Save changes" isDisabled onClick={activate} />
  ),
  'button-disabled-with-tooltip': activate => (
    <Button
      label="Save changes"
      isDisabled
      tooltip="Fill in every required field first"
      onClick={activate}
    />
  ),
  'button-loading': activate => (
    <Button label="Save changes" isLoading onClick={activate} />
  ),

  'icon-button': activate => (
    <IconButton
      label="Delete conversation"
      icon={<TrashIcon />}
      onClick={activate}
    />
  ),
  'icon-button-disabled': activate => (
    <IconButton
      label="Delete conversation"
      icon={<TrashIcon />}
      isDisabled
      onClick={activate}
    />
  ),
  'icon-button-loading': activate => (
    <IconButton
      label="Delete conversation"
      icon={<TrashIcon />}
      isLoading
      onClick={activate}
    />
  ),

  'clickable-card': activate => (
    <ClickableCard
      data-a11y-pointer-target
      label="Open billing settings"
      onClick={activate}>
      <div>Billing</div>
    </ClickableCard>
  ),
  'clickable-card-disabled': activate => (
    <ClickableCard
      data-a11y-pointer-target
      label="Open billing settings"
      isDisabled
      onClick={activate}>
      <div>Billing</div>
    </ClickableCard>
  ),

  'sidenav-collapse-icon': activate => (
    <CollapseHarness onActivate={activate} />
  ),
  'sidenav-collapse-labelled': activate => (
    <CollapseHarness label="Collapse sidebar" onActivate={activate} />
  ),

  'chat-send': activate => (
    <ChatSendButton isDisabled={false} onSend={activate} />
  ),
  'chat-send-disabled': activate => (
    <ChatSendButton isDisabled onSend={activate} />
  ),
  'chat-send-stop': activate => (
    <ChatSendButton isStopShown onStop={activate} />
  ),
};

export const BUTTON_EXCLUSION_RENDERS: Record<ButtonExclusionId, StateRender> =
  {
    'button-as-link': activate => (
      <Button label="Read the guide" href="#guide" onClick={activate} />
    ),
    'clickable-card-as-link': activate => (
      <ClickableCard
        label="Open billing settings"
        href="#billing"
        onClick={activate}>
        <div>Billing</div>
      </ClickableCard>
    ),
  };
