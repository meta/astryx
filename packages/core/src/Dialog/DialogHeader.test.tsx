// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DialogHeader.test.tsx
 * @input Uses vitest, @testing-library/react, DialogHeader component
 * @output Unit tests for DialogHeader component behavior
 * @position Testing; validates DialogHeader.tsx implementation
 *
 * SYNC: When DialogHeader.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {DialogHeader} from './DialogHeader';
import {Link} from '../Link';
import {LayoutDividerContext} from '../Layout/LayoutDividerContext';
import {defineTheme} from '../theme/defineTheme';
import {generateThemeCSS} from '../theme/generateThemeRules';

function generateThemeTestCSS(theme: Parameters<typeof generateThemeCSS>[0]) {
  const {prose, component} = generateThemeCSS(theme);
  return [prose, component].filter(Boolean).join('\n\n');
}

function getEndSlot(): HTMLElement {
  const child =
    screen.queryByRole('button', {name: 'Action'}) ??
    screen.getByRole('button', {name: /close/i});
  const slot = child.parentElement;
  if (slot == null) {
    throw new Error('Expected DialogHeader end slot');
  }
  return slot;
}

describe('DialogHeader', () => {
  it('renders the title', () => {
    render(<DialogHeader title="My Dialog Title" />);
    expect(
      screen.getByRole('heading', {level: 2, name: 'My Dialog Title'}),
    ).toBeInTheDocument();
  });

  it('renders the title as an h2 element', () => {
    render(<DialogHeader title="Title" />);
    const heading = screen.getByRole('heading', {level: 2});
    expect(heading.tagName).toBe('H2');
  });

  it('title has tabIndex=-1 for programmatic focus', () => {
    render(<DialogHeader title="Title" />);
    const heading = screen.getByRole('heading', {level: 2});
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('auto-focuses the title when mounted', () => {
    render(<DialogHeader title="Title" />);
    const heading = screen.getByRole('heading', {level: 2});
    expect(document.activeElement).toBe(heading);
  });

  it('renders subtitle when provided', () => {
    render(<DialogHeader title="Title" subtitle="This is a subtitle" />);
    expect(screen.getByText('This is a subtitle')).toBeInTheDocument();
  });

  it('does not render subtitle when not provided', () => {
    render(<DialogHeader title="Title" />);
    expect(screen.queryByText('This is a subtitle')).not.toBeInTheDocument();
  });

  it('renders a node title inside the focusable h2', () => {
    render(
      <DialogHeader
        title={
          <span data-testid="rich-title">
            Send <em>feedback</em>
          </span>
        }
      />,
    );
    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'Send feedback',
    });
    expect(heading).toContainElement(screen.getByTestId('rich-title'));
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(heading);
  });

  it('renders a node subtitle and keeps its link', () => {
    render(
      <DialogHeader
        title="Share"
        subtitle={
          <>
            Review the <Link href="#policy">sharing policy</Link> first.
          </>
        }
      />,
    );
    const link = screen.getByRole('link', {name: 'sharing policy'});
    expect(link).toHaveAttribute('href', '#policy');
    expect(link.closest('.astryx-dialog-header-title-block')).not.toBeNull();
    expect(screen.getByRole('heading', {level: 2})).not.toContainElement(link);
  });

  it('renders a numeric zero subtitle inside the title block', () => {
    const {container} = render(<DialogHeader title="Title" subtitle={0} />);
    const titleBlock = container.querySelector(
      '.astryx-dialog-header-title-block',
    );
    expect(titleBlock?.children).toHaveLength(2);
    expect(titleBlock?.children[1]).toHaveTextContent(/^0$/);
  });

  it.each([
    ['empty string', ''],
    ['false', false],
    ['true', true],
    ['null', null],
    ['undefined', undefined],
  ])('renders no subtitle for %s', (_, subtitle) => {
    const {container} = render(
      <DialogHeader title="Title" subtitle={subtitle} />,
    );
    const titleBlock = container.querySelector(
      '.astryx-dialog-header-title-block',
    );
    expect(titleBlock?.children).toHaveLength(1);
  });

  it('renders close button when onOpenChange is provided', () => {
    render(<DialogHeader title="Title" onOpenChange={() => {}} />);
    const closeButton = screen.getByRole('button', {name: /close/i});

    expect(closeButton).toBeInTheDocument();
    expect(closeButton.parentElement).toHaveClass(
      'astryx-dialog-header-end-content',
    );
  });

  it('preserves automatic end-slot compensation when the close action renders', () => {
    const {rerender} = render(
      <DialogHeader title="Title" onOpenChange={() => {}} />,
    );
    const automaticClassName = getEndSlot().className;

    rerender(
      <DialogHeader
        title="Title"
        endContent={<button type="button">Action</button>}
        onOpenChange={() => {}}
      />,
    );
    expect(getEndSlot().className).toBe(automaticClassName);

    rerender(
      <DialogHeader
        title="Title"
        endContent={<button type="button">Action</button>}
      />,
    );
    expect(getEndSlot().className).not.toBe(automaticClassName);
  });

  it('lets endContentEdgeCompensation select inline, block, or all', () => {
    const {rerender} = render(
      <DialogHeader
        title="Title"
        endContent={<button type="button">Action</button>}
      />,
    );
    const noCompensationClassName = getEndSlot().className;

    rerender(
      <DialogHeader
        title="Title"
        endContent={<button type="button">Action</button>}
        endContentEdgeCompensation="inline"
      />,
    );
    const inlineClassName = getEndSlot().className;

    rerender(
      <DialogHeader
        title="Title"
        endContent={<button type="button">Action</button>}
        endContentEdgeCompensation="block"
      />,
    );
    const blockClassName = getEndSlot().className;

    rerender(
      <DialogHeader
        title="Title"
        endContent={<button type="button">Action</button>}
        endContentEdgeCompensation="all"
      />,
    );
    const allClassName = getEndSlot().className;

    expect(inlineClassName).not.toBe(noCompensationClassName);
    expect(blockClassName).not.toBe(noCompensationClassName);
    expect(inlineClassName).not.toBe(blockClassName);
    expect(allClassName).not.toBe(inlineClassName);
    expect(allClassName).not.toBe(blockClassName);

    rerender(
      <DialogHeader
        title="Title"
        endContent={<button type="button">Action</button>}
        onOpenChange={() => {}}
      />,
    );
    expect(getEndSlot().className).toBe(allClassName);

    rerender(
      <DialogHeader
        title="Title"
        endContent={<button type="button">Action</button>}
        endContentEdgeCompensation="inline"
        onOpenChange={() => {}}
      />,
    );
    expect(getEndSlot().className).toBe(inlineClassName);
  });

  it('exposes theme targets for the header row, title block, both content slots, and close icon', () => {
    const {container} = render(
      <DialogHeader
        title="Title"
        subtitle="Subtitle"
        startContent={<button type="button">Back</button>}
        endContent={<button type="button">Custom Action</button>}
        onOpenChange={() => {}}
      />,
    );

    expect(container.querySelector('.astryx-dialog-header')).not.toBeNull();
    expect(
      screen.getByRole('button', {name: 'Back'}).parentElement,
    ).toHaveClass('astryx-dialog-header-start-content');
    expect(screen.getByRole('heading', {level: 2}).parentElement).toHaveClass(
      'astryx-dialog-header-title-block',
    );

    const endContent = screen.getByRole('button', {
      name: 'Custom Action',
    }).parentElement;
    expect(endContent).toHaveClass('astryx-dialog-header-end-content');
    expect(screen.getByRole('button', {name: /close/i}).parentElement).toBe(
      endContent,
    );

    const closeIcon = screen
      .getByRole('button', {name: /close/i})
      .querySelector('.astryx-dialog-header-close-icon');
    expect(closeIcon).toHaveClass('astryx-icon');
  });

  it('renders numeric zero in both content slots', () => {
    const {container} = render(
      <DialogHeader title="Title" startContent={0} endContent={0} />,
    );

    expect(
      container.querySelector('.astryx-dialog-header-start-content'),
    ).toHaveTextContent(/^0$/);
    expect(
      container.querySelector('.astryx-dialog-header-end-content'),
    ).toHaveTextContent(/^0$/);
  });

  it('exposes the start-content target when startContent renders', () => {
    const {container} = render(
      <DialogHeader
        title="Title"
        startContent={<button type="button">Back</button>}
      />,
    );

    expect(
      screen.getByRole('button', {name: 'Back'}).parentElement,
    ).toHaveClass('astryx-dialog-header-start-content');
    expect(
      container.querySelectorAll('.astryx-dialog-header-start-content'),
    ).toHaveLength(1);
  });

  it('exposes the end-content target when endContent renders without a close button', () => {
    const {container} = render(
      <DialogHeader
        title="Title"
        endContent={<button type="button">Custom Action</button>}
      />,
    );

    expect(
      screen.getByRole('button', {name: 'Custom Action'}).parentElement,
    ).toHaveClass('astryx-dialog-header-end-content');
    expect(
      container.querySelectorAll('.astryx-dialog-header-end-content'),
    ).toHaveLength(1);
  });

  it.each([
    ['empty string', ''],
    ['false', false],
    ['true', true],
    ['null', null],
    ['undefined', undefined],
  ])('omits both content-slot targets for %s', (_, content) => {
    const {container} = render(
      <DialogHeader
        title="Title"
        startContent={content}
        endContent={content}
      />,
    );

    expect(
      container.querySelector('.astryx-dialog-header-start-content'),
    ).toBeNull();
    expect(
      container.querySelector('.astryx-dialog-header-end-content'),
    ).toBeNull();
  });

  it('lets themes set the internal gaps and close-icon size', () => {
    const theme = defineTheme({
      name: 'dialog-header-targets-test',
      components: {
        'dialog-header': {base: {gap: '8px'}},
        'dialog-header-start-content': {base: {gap: '5px'}},
        'dialog-header-title-block': {base: {gap: '4px'}},
        'dialog-header-end-content': {base: {gap: '6px'}},
        'dialog-header-close-icon': {
          base: {width: '16px', height: '16px', fontSize: '16px'},
        },
      },
    });
    const css = generateThemeTestCSS(theme);

    expect(css).toContain('.astryx-dialog-header {');
    expect(css).toContain('gap: 8px');
    expect(css).toContain('.astryx-dialog-header-start-content {');
    expect(css).toContain('gap: 5px');
    expect(css).toContain('.astryx-dialog-header-title-block {');
    expect(css).toContain('gap: 4px');
    expect(css).toContain('.astryx-dialog-header-end-content {');
    expect(css).toContain('gap: 6px');
    expect(css).toContain('.astryx-dialog-header-close-icon {');
    expect(css).toContain('width: 16px');
    expect(css).toContain('height: 16px');
  });

  it('does not render close button when onOpenChange is not provided', () => {
    render(<DialogHeader title="Title" />);
    expect(
      screen.queryByRole('button', {name: /close/i}),
    ).not.toBeInTheDocument();
  });

  it('calls onOpenChange(false) when close button is clicked', async () => {
    const user = userEvent.setup();
    const handleHide = vi.fn();
    render(<DialogHeader title="Title" onOpenChange={handleHide} />);

    await user.click(screen.getByRole('button', {name: /close/i}));
    expect(handleHide).toHaveBeenCalledTimes(1);
  });

  it('renders without divider by default (no context)', () => {
    // Without context, hasDivider defaults to false — same classes as explicit hasDivider={false}
    const {container: noCtx} = render(<DialogHeader title="No ctx" />);
    const {container: explicitFalse} = render(
      <DialogHeader title="Explicit false" hasDivider={false} />,
    );
    const noCtxHeader = noCtx.firstChild as HTMLElement;
    const explicitFalseHeader = explicitFalse.firstChild as HTMLElement;
    expect(noCtxHeader.className).toBe(explicitFalseHeader.className);
  });

  it('renders with divider when context defaultHasDividers is true', () => {
    // With context true and no explicit prop, should match explicit hasDivider={true}
    const {container: ctxTrue} = render(
      <LayoutDividerContext value={{defaultHasDividers: true}}>
        <DialogHeader title="Ctx true" />
      </LayoutDividerContext>,
    );
    const {container: explicitTrue} = render(
      <DialogHeader title="Explicit true" hasDivider={true} />,
    );
    const ctxHeader = ctxTrue.firstChild as HTMLElement;
    const explicitHeader = explicitTrue.firstChild as HTMLElement;
    expect(ctxHeader.className).toBe(explicitHeader.className);
  });

  it('explicit hasDivider={false} overrides context defaultHasDividers=true', () => {
    const {container: overridden} = render(
      <LayoutDividerContext value={{defaultHasDividers: true}}>
        <DialogHeader title="Overridden" hasDivider={false} />
      </LayoutDividerContext>,
    );
    const {container: noDivider} = render(
      <DialogHeader title="No divider" hasDivider={false} />,
    );
    const overriddenHeader = overridden.firstChild as HTMLElement;
    const noDividerHeader = noDivider.firstChild as HTMLElement;
    expect(overriddenHeader.className).toBe(noDividerHeader.className);
  });

  it('explicit hasDivider={true} shows divider without context', () => {
    // Explicit true should differ from default (no context = false)
    const {container: withDiv} = render(
      <DialogHeader title="With div" hasDivider={true} />,
    );
    const {container: withoutDiv} = render(
      <DialogHeader title="Without div" hasDivider={false} />,
    );
    const withDivHeader = withDiv.firstChild as HTMLElement;
    const withoutDivHeader = withoutDiv.firstChild as HTMLElement;
    expect(withDivHeader.className).not.toBe(withoutDivHeader.className);
  });

  it('renders additional endContent', () => {
    render(
      <DialogHeader
        title="Title"
        endContent={<button type="button">Custom Action</button>}
      />,
    );
    expect(
      screen.getByRole('button', {name: 'Custom Action'}),
    ).toBeInTheDocument();
  });

  it('renders endContent alongside close button', () => {
    render(
      <DialogHeader
        title="Title"
        onOpenChange={() => {}}
        endContent={<button type="button">Custom Action</button>}
      />,
    );
    expect(
      screen.getByRole('button', {name: 'Custom Action'}),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /close/i})).toBeInTheDocument();
  });

  it('renders startContent before the title', () => {
    render(
      <DialogHeader
        title="Title"
        startContent={<button type="button">Back</button>}
      />,
    );
    expect(screen.getByRole('button', {name: 'Back'})).toBeInTheDocument();
  });

  it('renders startContent and endContent together', () => {
    render(
      <DialogHeader
        title="Title"
        startContent={<button type="button">Back</button>}
        endContent={<button type="button">Save</button>}
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', {name: 'Back'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Save'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /close/i})).toBeInTheDocument();
  });
});
