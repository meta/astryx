// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file StatusMessage.a11y.renders.tsx
 * @input Uses current Core status-message components and the binding state ids
 * @output One public-interface rendering for every Core status-message binding state
 * @position Shared jsdom and checked-in Storybook fixture layer
 */

import {useEffect, useState, type ReactElement, type ReactNode} from 'react';
import {ProgressBar} from '../../ProgressBar/ProgressBar';
import {Spinner} from '../../Spinner/Spinner';
import {Toast} from '../../Toast/Toast';
import {ToastViewport} from '../../Toast/ToastViewport';
import {useToast} from '../../Toast/useToast';
import {useAnnounce, type AnnouncePoliteness} from '../../hooks/useAnnounce';
import {FieldStatus} from '../FieldStatus';
import type {CoreStatusMessageStateId} from './StatusMessage.a11y.states';

const transitionTestId = (name: string) => `status-transition-${name}`;

function TransitionButton({
  name,
  onClick,
}: {
  name: string;
  onClick: () => void;
}) {
  return (
    <button
      data-testid={transitionTestId(name)}
      type="button"
      onClick={onClick}>
      {name}
    </button>
  );
}

function Frame({
  children,
  isReady = true,
}: {
  children: ReactNode;
  isReady?: boolean;
}) {
  return (
    <div>
      <span data-a11y-ready={String(isReady)} hidden />
      <button data-a11y-relation="focus-anchor" type="button">
        Keep focus
      </button>
      {children}
    </div>
  );
}

/**
 * Establishes the same singleton channel the component will update, then clears
 * the seed before the test starts. This lets a browser binding inspect the
 * pre-existing empty node; the contract's plain-HTML fixtures separately prove
 * the first-use insertion order.
 */
function PrimeLiveRegion({politeness}: {politeness: AnnouncePoliteness}) {
  const announce = useAnnounce();
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    let secondFrame = 0;
    announce('Preparing status channel', politeness);
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        announce('', politeness);
        setIsReady(true);
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [announce, politeness]);
  return <span data-a11y-ready={String(isReady)} hidden />;
}

function ToastAnnouncementButtons({type}: {type: 'info' | 'error'}) {
  const toast = useToast();
  const message = type === 'error' ? 'Upload failed' : 'Changes saved';
  const replacement =
    type === 'error' ? 'Connection failed' : 'Profile updated';
  const show = (body: string) =>
    toast({
      body,
      type,
      uniqueID: `status-contract-${type}`,
      isAutoHide: false,
    });
  return (
    <>
      <TransitionButton name="show" onClick={() => show(message)} />
      <TransitionButton name="replace" onClick={() => show(replacement)} />
      <TransitionButton name="repeat" onClick={() => show(message)} />
    </>
  );
}

function ToastAnnouncementHarness({type}: {type: 'info' | 'error'}) {
  const politeness = type === 'error' ? 'assertive' : 'polite';
  return (
    <ToastViewport isTopLayer={false}>
      <PrimeLiveRegion politeness={politeness} />
      <button data-a11y-relation="focus-anchor" type="button">
        Keep focus
      </button>
      <ToastAnnouncementButtons type={type} />
    </ToastViewport>
  );
}

function ToastCardHarness({type}: {type: 'info' | 'error'}) {
  const message = type === 'error' ? 'Upload failed' : 'Changes saved';
  const replacement =
    type === 'error' ? 'Connection failed' : 'Profile updated';
  const [body, setBody] = useState(message);
  return (
    <Frame>
      <TransitionButton name="show" onClick={() => setBody(message)} />
      <TransitionButton name="replace" onClick={() => setBody(replacement)} />
      <Toast
        type={type}
        body={body}
        isAutoHide={false}
        autoHideDuration={5000}
        onDismiss={() => {}}
      />
    </Frame>
  );
}

function FieldStatusHarness({
  type,
  variant,
  message,
  replacement,
}: {
  type: 'error' | 'warning' | 'success';
  variant: 'attached' | 'detached';
  message: string;
  replacement: string;
}) {
  const politeness = type === 'error' ? 'assertive' : 'polite';
  const [current, setCurrent] = useState('');
  const [version, setVersion] = useState(0);
  return (
    <>
      <PrimeLiveRegion politeness={politeness} />
      <button data-a11y-relation="focus-anchor" type="button">
        Keep focus
      </button>
      <TransitionButton name="show" onClick={() => setCurrent(message)} />
      <TransitionButton
        name="replace"
        onClick={() => setCurrent(replacement)}
      />
      <TransitionButton
        name="repeat"
        onClick={() => {
          setCurrent(message);
          setVersion(value => value + 1);
        }}
      />
      <FieldStatus
        key={version}
        type={type}
        variant={variant}
        message={current}
      />
    </>
  );
}

function SpinnerHarness({visibleLabel}: {visibleLabel: boolean}) {
  const initial = visibleLabel ? 'Fetching data' : undefined;
  const replacement = visibleLabel ? 'Saving data' : 'Saving';
  const [label, setLabel] = useState<string | undefined>(initial);
  return (
    <Frame>
      <TransitionButton name="show" onClick={() => setLabel(initial)} />
      <TransitionButton name="replace" onClick={() => setLabel(replacement)} />
      {visibleLabel ? (
        <Spinner label={label ?? 'Fetching data'} />
      ) : label == null ? (
        <Spinner />
      ) : (
        <Spinner aria-label={label} />
      )}
    </Frame>
  );
}

function ProgressHarness({
  initial,
  progressValue = 40,
  completionValue = 100,
  max = 100,
  withMark = false,
}: {
  initial?: 'loading' | number;
  progressValue?: number;
  completionValue?: number;
  max?: number;
  withMark?: boolean;
}) {
  const [progress, setProgress] = useState<'loading' | number>(
    initial ?? (withMark ? 20 : 'loading'),
  );
  return (
    <Frame>
      <TransitionButton
        name="progress"
        onClick={() => setProgress(progressValue)}
      />
      <TransitionButton
        name="complete"
        onClick={() => setProgress(completionValue)}
      />
      <ProgressBar
        label="Upload progress"
        isIndeterminate={progress === 'loading'}
        value={typeof progress === 'number' ? progress : 0}
        max={max}
        marks={withMark ? [{value: 75, label: 'Target'}] : undefined}
      />
    </Frame>
  );
}

export type CoreStatusMessageStateRender = () => ReactElement;

export const CORE_STATUS_MESSAGE_STATE_RENDERS: Record<
  CoreStatusMessageStateId,
  CoreStatusMessageStateRender
> = {
  'toast-info-announcement': () => <ToastAnnouncementHarness type="info" />,
  'toast-error-announcement': () => <ToastAnnouncementHarness type="error" />,
  'toast-info-card-mounted': () => <ToastCardHarness type="info" />,
  'toast-error-card-mounted': () => <ToastCardHarness type="error" />,
  'field-status-error-attached': () => (
    <FieldStatusHarness
      type="error"
      variant="attached"
      message="This field is required"
      replacement="Enter a valid email address"
    />
  ),
  'field-status-warning-detached': () => (
    <FieldStatusHarness
      type="warning"
      variant="detached"
      message="Check this value"
      replacement="This value may be visible to others"
    />
  ),
  'field-status-success-detached': () => (
    <FieldStatusHarness
      type="success"
      variant="detached"
      message="Looks good"
      replacement="Changes saved"
    />
  ),
  'spinner-default-label-mounted': () => (
    <SpinnerHarness visibleLabel={false} />
  ),
  'spinner-visible-label-mounted': () => <SpinnerHarness visibleLabel />,
  'progress-loading-to-complete': () => <ProgressHarness />,
  'progress-custom-range': () => (
    <ProgressHarness
      initial={1}
      progressValue={3}
      completionValue={5}
      max={5}
    />
  ),
  'progress-mark-focused-update': () => <ProgressHarness withMark />,
};

export {transitionTestId};
