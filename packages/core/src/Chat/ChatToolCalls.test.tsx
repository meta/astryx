// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRef} from 'react';
import {describe, it, expect} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {Theme} from '../theme/Theme';
import {defineTheme} from '../theme/defineTheme';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {ChatToolCalls} from './ChatToolCalls';

describe('ChatToolCalls', () => {
  it('renders nothing for empty calls', () => {
    const {container} = render(<ChatToolCalls calls={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('forwards the root ref and supported DOM props', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ChatToolCalls
        ref={ref}
        calls={[{name: 'bash'}]}
        data-testid="tool-calls"
        aria-label="Tool activity"
        className="consumer-class"
        style={{marginBlockStart: 12}}
      />,
    );

    const root = screen.getByTestId('tool-calls');
    expect(ref.current).toBe(root);
    expect(root).toHaveAttribute('aria-label', 'Tool activity');
    expect(root).toHaveClass('astryx-chat-tool-calls', 'consumer-class');
    expect(root).toHaveStyle({marginBlockStart: '12px'});
  });

  it('renders single call inline without group chrome', () => {
    render(
      <ChatToolCalls
        calls={[{name: 'bash', status: 'complete', duration: '1.2s'}]}
      />,
    );
    expect(screen.getByText('bash')).toBeInTheDocument();
    expect(screen.getByText('1.2s')).toBeInTheDocument();
    // No group header / expand button for single call
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('resolves complete and error marks through the themed semantic icon registry', () => {
    const theme = defineTheme({
      name: 'chat-tool-call-semantic-icons',
      icons: {
        success: <svg data-testid="themed-success" />,
        error: <svg data-testid="themed-error" />,
      },
    });

    render(
      <Theme theme={theme}>
        <ChatToolCalls
          defaultIsExpanded
          calls={[
            {key: 'done', name: 'read', status: 'complete'},
            {
              key: 'failed',
              name: 'bash',
              status: 'error',
              errorMessage: 'Command failed',
            },
          ]}
        />
      </Theme>,
    );

    expect(screen.getByTestId('themed-success')).toBeInTheDocument();
    expect(screen.getByTestId('themed-error')).toBeInTheDocument();
  });

  it('renders latest call as surface for multiple calls', () => {
    render(
      <ChatToolCalls
        calls={[
          {name: 'searchCode', status: 'complete'},
          {name: 'readFile', status: 'complete'},
          {name: 'editFile', status: 'running'},
        ]}
      />,
    );
    // Latest call (editFile) shown at surface + in expanded list
    expect(screen.getAllByText('editFile').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('hides duration when not complete', () => {
    render(
      <ChatToolCalls
        calls={[{name: 'bash', status: 'running', duration: '1.2s'}]}
      />,
    );
    expect(screen.queryByText('1.2s')).not.toBeInTheDocument();
  });

  it.each([
    ['pending', 'Pending'],
    ['running', 'Running'],
    ['complete', 'Complete'],
    ['error', 'Failed'],
  ] as const)(
    'names the %s status for assistive technology',
    (status, label) => {
      render(<ChatToolCalls calls={[{name: 'bash', status}]} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('includes the status in an expandable row accessible name', () => {
    render(
      <ChatToolCalls
        calls={[
          {
            name: 'readFile',
            status: 'running',
            resultDetail: <div>file contents</div>,
          },
        ]}
      />,
    );
    expect(
      screen.getByRole('button', {name: /Running.*readFile/}),
    ).toBeInTheDocument();
  });

  it('includes the latest status in a collapsed group accessible name', () => {
    render(
      <ChatToolCalls
        calls={[
          {name: 'searchCode', status: 'complete'},
          {name: 'editFile', status: 'running'},
        ]}
      />,
    );
    expect(
      screen.getByRole('button', {name: /Running.*editFile/}),
    ).toBeInTheDocument();
  });

  it('defaults to collapsed', () => {
    render(
      <ChatToolCalls
        calls={[
          {name: 'a', status: 'complete'},
          {name: 'b', status: 'complete'},
        ]}
      />,
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('auto-collapses groups of more than 3', () => {
    render(
      <ChatToolCalls
        calls={[{name: 'a'}, {name: 'b'}, {name: 'c'}, {name: 'd'}]}
      />,
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('toggles on click', () => {
    render(
      <ChatToolCalls
        defaultIsExpanded={false}
        calls={[
          {name: 'a', status: 'complete'},
          {name: 'b', status: 'complete'},
        ]}
      />,
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders the public custom group label when expanded', () => {
    render(
      <ChatToolCalls
        label="Repository updates"
        defaultIsExpanded
        calls={[{name: 'read'}, {name: 'edit'}]}
      />,
    );

    expect(screen.getByText('Repository updates')).toBeInTheDocument();
    expect(screen.queryByText('2 tool calls')).not.toBeInTheDocument();
  });

  it('removes collapsed call rows from keyboard and accessibility navigation', () => {
    render(
      <ChatToolCalls
        calls={[
          {name: 'read', resultDetail: <div>file contents</div>},
          {name: 'edit', resultDetail: <div>diff contents</div>},
        ]}
      />,
    );

    const header = screen.getAllByRole('button')[0];
    const content = document.getElementById(
      header.getAttribute('aria-controls') as string,
    );
    expect(content).toHaveAttribute('inert');

    fireEvent.click(header);
    expect(content).not.toHaveAttribute('inert');
  });

  it('composes the shared visible focus ring on every disclosure control', () => {
    render(
      <ChatToolCalls
        defaultIsExpanded
        calls={[
          {name: 'read', resultDetail: <div>file contents</div>},
          {name: 'edit'},
        ]}
      />,
    );

    const buttons = screen.getAllByRole('button');
    const focusRingClasses = stylex
      .props(focusOutlineStyles.focusVisible)
      .className!.split(' ');
    const [focusRingMarker] = focusRingClasses;
    for (const button of buttons) {
      expect(button).toHaveClass(focusRingMarker);
    }
    // The group header keeps the shared ring unchanged. Grouped detail rows
    // replace only its offset with an inset value so the animated clip boundary
    // cannot hide the ring; the focused Storybook story verifies that geometry.
    for (const className of focusRingClasses) {
      expect(buttons[0]).toHaveClass(className);
    }
  });

  it('shows target when provided', () => {
    render(
      <ChatToolCalls
        calls={[{name: 'bash', target: 'git status', status: 'complete'}]}
      />,
    );
    expect(screen.getByText('git status')).toBeInTheDocument();
  });

  it('exposes no aria-expanded on a call row without resultDetail', () => {
    const {container} = render(
      <ChatToolCalls calls={[{name: 'bash', status: 'complete'}]} />,
    );
    expect(container.querySelector('[aria-expanded]')).toBeNull();
  });

  it('wires disclosure semantics on an expandable call row', () => {
    render(
      <ChatToolCalls
        calls={[
          {
            name: 'readFile',
            status: 'complete',
            resultDetail: <div>file contents here</div>,
          },
        ]}
      />,
    );
    const row = screen.getByRole('button');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    // Detail panel is conditionally mounted, so no aria-controls while closed.
    expect(row).not.toHaveAttribute('aria-controls');
    expect(screen.queryByText('file contents here')).not.toBeInTheDocument();

    fireEvent.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'true');
    const detailId = row.getAttribute('aria-controls');
    expect(detailId).toBeTruthy();
    const panel = document.getElementById(detailId as string);
    expect(panel).not.toBeNull();
    expect(panel).toHaveTextContent('file contents here');
  });

  it('exposes the error message as text without requiring hover', () => {
    render(
      <ChatToolCalls
        calls={[
          {
            name: 'bash',
            status: 'error',
            errorMessage: 'Command exited with code 1',
          },
        ]}
      />,
    );
    // The message must exist as real (screen-reader-visible) text content,
    // not only inside a hover-only title attribute.
    expect(screen.getByText(/Command exited with code 1/)).toBeInTheDocument();
  });

  it('includes the error message in the accessible name of an expandable error row', () => {
    render(
      <ChatToolCalls
        calls={[
          {
            name: 'bash',
            status: 'error',
            errorMessage: 'Command exited with code 1',
            resultDetail: <div>stderr output</div>,
          },
        ]}
      />,
    );
    expect(
      screen.getByRole('button', {name: /Command exited with code 1/}),
    ).toBeInTheDocument();
  });

  it('keeps the hover tooltip on the error status icon', () => {
    const {container} = render(
      <ChatToolCalls
        calls={[
          {
            name: 'bash',
            status: 'error',
            errorMessage: 'Command exited with code 1',
          },
        ]}
      />,
    );
    expect(
      container.querySelector('[title="Command exited with code 1"]'),
    ).not.toBeNull();
  });

  it('renders no error text for non-error calls', () => {
    render(
      <ChatToolCalls
        calls={[
          {name: 'bash', status: 'complete', errorMessage: 'stale message'},
        ]}
      />,
    );
    expect(screen.queryByText(/stale message/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Error:/)).not.toBeInTheDocument();
  });

  it('points the group header aria-controls at the content region', () => {
    render(
      <ChatToolCalls
        defaultIsExpanded={true}
        calls={[
          {name: 'searchCode', status: 'complete'},
          {name: 'readFile', status: 'complete'},
        ]}
      />,
    );
    const header = screen.getByRole('button');
    expect(header).toHaveAttribute('aria-expanded', 'true');
    const regionId = header.getAttribute('aria-controls');
    expect(regionId).toBeTruthy();
    const region = document.getElementById(regionId as string);
    expect(region).not.toBeNull();
    expect(region).toHaveTextContent('searchCode');
    expect(region).toHaveTextContent('readFile');
  });

  it('compensates the grouped rows overhang on the clip boundary so the hover background is not cut off', () => {
    render(
      <ChatToolCalls
        defaultIsExpanded={true}
        calls={[
          {name: 'bash', status: 'complete'},
          {name: 'read', status: 'complete'},
        ]}
      />,
    );
    const regionId = screen.getByRole('button').getAttribute('aria-controls');
    const groupContent = document.getElementById(regionId as string);
    // groupContentInner is the overflow:hidden clip boundary required for the
    // grid height animation; its direct child (`list`) pulls itself outward
    // by a negative inline margin so each row's hover background can overhang
    // the text column without widening the layout. Without a matching
    // padding/negative-margin pair on groupContentInner itself, that overhang
    // extends past the clip boundary and gets cut off (#4830) instead of
    // being absorbed the same way it is for a single, unwrapped call row.
    const groupContentInner = groupContent!.firstElementChild as HTMLElement;
    const list = groupContentInner.firstElementChild as HTMLElement;
    // jsdom's getComputedStyle doesn't resolve StyleX's generated atomic
    // classes here, so assert on the classes directly instead. StyleX emits
    // one atomic class per distinct property+value pair, so identical
    // paddingInline/marginInline values on two elements always produce the
    // exact same class names — if groupContentInner mirrors list's
    // padding/margin pair, their class lists intersect on (at least) those
    // two classes; if the fix is missing, groupContentInner only has its own
    // unrelated overflow/minHeight classes and shares nothing with list.
    const innerClasses = new Set(groupContentInner.className.split(' '));
    const listClasses = new Set(list.className.split(' '));
    const shared = [...listClasses].filter(c => innerClasses.has(c));
    expect(shared.length).toBeGreaterThanOrEqual(2);
  });
});
