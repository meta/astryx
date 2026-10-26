// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Banner.test.tsx
 * @input Uses vitest, @testing-library/react, Banner component
 * @output Unit tests for Banner component behavior, including default and
 *   explicit live-region roles, augmented-status color fallback, scoped status
 *   control context that does not recolor tooltips, the 'banner-frame' theme
 *   target on the outer elevation/radius painter, and the 'banner-icon' theme
 *   target on the status icon glyph (#4166)
 * @position Testing; validates Banner.tsx implementation
 *
 * SYNC: When modified, update this header
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {Banner, type BannerStatus} from './Banner';
import {defineTheme, generateThemeCSS} from '../theme';
import {registerIcons, resetIcons} from '../Icon';
import {InternationalizationProvider} from '../i18n';
import {getForcedColorsRules} from '../__tests__/forcedColors';

describe('Banner', () => {
  afterEach(() => {
    resetIcons();
  });

  it('renders with title and status', () => {
    render(<Banner status="info" title="Test Banner" />);
    expect(screen.getByText('Test Banner')).toBeInTheDocument();
  });

  it('does not infer a live-region role from visual status', () => {
    const statuses = ['info', 'warning', 'error', 'success'] as const;
    for (const status of statuses) {
      const {container, unmount} = render(
        <Banner status={status} title={`${status} banner`} />,
      );
      expect(container.firstElementChild).not.toHaveAttribute('role');
      expect(container.firstElementChild).not.toHaveAttribute('aria-live');
      unmount();
    }
  });

  it('forwards an explicit persistent or alert role', () => {
    const {rerender} = render(
      <Banner status="info" title="Saved" role="status" />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Saved');

    rerender(<Banner status="error" title="Failed" role="alert" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
  });

  it('renders default icon per status with aria-hidden', () => {
    const {container} = render(<Banner status="info" title="Info Banner" />);
    const iconWrapper = container.querySelector('[aria-hidden="true"]');
    expect(iconWrapper).toBeInTheDocument();
    // Default icon should be an SVG
    const svg = iconWrapper?.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders custom icon override', () => {
    render(
      <Banner
        status="info"
        title="Custom Icon"
        icon={<span data-testid="custom-icon">★</span>}
      />,
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(
      <Banner
        status="info"
        title="Title"
        description="This is a description"
      />,
    );
    expect(screen.getByText('This is a description')).toBeInTheDocument();
  });

  it('renders title and description as <div> (never <p>) for composition safety', () => {
    const {container} = render(
      <Banner status="info" title="Title" description="Description" />,
    );
    // Block content can be nested inside Banner text slots without tripping
    // the phrasing-content trap that <p> imposes, so neither slot is a <p>.
    expect(container.querySelector('p')).toBeNull();
    expect(screen.getByText('Title').tagName).toBe('DIV');
    expect(screen.getByText('Description').tagName).toBe('DIV');
  });

  it('does not render description when not provided', () => {
    render(<Banner status="info" title="Title Only" />);
    // Title renders; no description text is present.
    expect(screen.getByText('Title Only')).toBeInTheDocument();
    expect(screen.queryByText('This is a description')).not.toBeInTheDocument();
  });

  it('keeps base title and description colors for an augmented status', () => {
    const augmentedStatus = 'neutral' as unknown as BannerStatus;
    const {rerender} = render(
      <Banner
        status={augmentedStatus}
        title="Neutral title"
        description="Neutral description"
      />,
    );

    const customTitleClass = screen.getByText('Neutral title').className;
    const customDescriptionClass = screen.getByText(
      'Neutral description',
    ).className;

    rerender(
      <Banner
        status="info"
        title="Info title"
        description="Info description"
      />,
    );

    expect(screen.getByText('Info title').className).not.toBe(customTitleClass);
    expect(screen.getByText('Info description').className).not.toBe(
      customDescriptionClass,
    );
  });

  it.each([
    ['info', 'var(--color-on-info-muted)'],
    ['success', 'var(--color-on-success-muted)'],
    ['warning', 'var(--color-on-warning-muted)'],
    ['error', 'var(--color-on-error-muted)'],
  ] as const)(
    'routes %s built-in controls to the matching on-muted role without recoloring tooltips',
    (status, expectedRole) => {
      render(
        <Banner
          status={status}
          title={`${status} banner`}
          collapsible={{defaultIsOpen: true}}
          isDismissable>
          <div>Details</div>
        </Banner>,
      );

      for (const button of [
        screen.getByRole('button', {name: 'Collapse'}),
        screen.getByRole('button', {name: `Dismiss ${status} banner`}),
      ]) {
        expect(
          getComputedStyle(button).getPropertyValue('--color-text-primary'),
        ).toBe(expectedRole);
        const tooltip = document.getElementById(
          button.getAttribute('aria-describedby')!,
        );
        expect(tooltip).not.toBeNull();
        expect(
          getComputedStyle(tooltip!).getPropertyValue('--color-text-primary'),
        ).not.toBe(expectedRole);
      }
    },
  );

  it('renders dismiss button when isDismissable', () => {
    render(<Banner status="info" title="Dismissable" isDismissable />);
    expect(
      screen.getByRole('button', {name: 'Dismiss Dismissable'}),
    ).toBeInTheDocument();
  });

  it('calls onDismiss when dismiss button is clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <Banner
        status="info"
        title="Dismissable"
        isDismissable
        onDismiss={onDismiss}
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Dismiss Dismissable'}));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('hides banner on dismiss without onDismiss callback', async () => {
    const user = userEvent.setup();
    render(
      <Banner
        status="info"
        title="Self Dismissing"
        isDismissable
        data-testid="banner"
      />,
    );
    expect(screen.getByTestId('banner')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {name: 'Dismiss Self Dismissing'}),
    );
    expect(screen.queryByTestId('banner')).not.toBeInTheDocument();
  });

  it('hides banner on dismiss and calls onDismiss', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <Banner
        status="info"
        title="Dismissable"
        isDismissable
        onDismiss={onDismiss}
        data-testid="banner"
      />,
    );
    await user.click(screen.getByRole('button', {name: 'Dismiss Dismissable'}));
    expect(screen.queryByTestId('banner')).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not render dismiss button when isDismissable is false', () => {
    render(<Banner status="info" title="Not Dismissable" />);
    expect(screen.queryByRole('button', {name: /^Dismiss/})).toBeNull();
  });

  it('leaves consumer endContent outside the built-in status control context', () => {
    render(
      <Banner
        status="success"
        title="With Action"
        endContent={
          <button type="button" data-testid="end-btn">
            Action
          </button>
        }
      />,
    );
    const action = screen.getByTestId('end-btn');
    expect(action).toBeInTheDocument();
    expect(action.className).not.toContain(
      'Banner__statusControlStyles.success',
    );
  });

  it('renders card container by default', () => {
    const {container} = render(<Banner status="info" title="Card Container" />);
    const root = container.firstElementChild;
    expect(root).toBeInTheDocument();
  });

  it('renders section container', () => {
    const {container} = render(
      <Banner status="info" title="Section Container" container="section" />,
    );
    const root = container.firstElementChild;
    expect(root).toBeInTheDocument();
  });

  // =========================================================================
  // Content area — collapsible by default, `collapsible={false}` opts out
  // =========================================================================

  it('hides children behind a toggle by default', () => {
    render(
      <Banner status="info" title="Collapsible">
        <div data-testid="child-content">Extra content</div>
      </Banner>,
    );
    // The historical default, unchanged: chevron present, content collapsed.
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Expand'})).toBeInTheDocument();
  });

  it('treats an explicit collapsible={true} as the default', () => {
    render(
      <Banner status="info" title="Explicit" collapsible>
        <div data-testid="child-content">Extra content</div>
      </Banner>,
    );
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Expand'})).toBeInTheDocument();
  });

  it('shows children with no toggle for collapsible={false}', () => {
    render(
      <Banner status="info" title="Opted out" collapsible={false}>
        <div data-testid="child-content">Extra content</div>
      </Banner>,
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'Expand'}),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'Collapse'}),
    ).not.toBeInTheDocument();
  });

  it('leaves non-collapsible content out of the disclosure wiring', () => {
    render(
      <Banner
        status="info"
        title="Plain content"
        isDismissable
        collapsible={false}>
        <div data-testid="child-content">Extra content</div>
      </Banner>,
    );
    // No toggle exists, so nothing should carry disclosure state, and the
    // region needs no id for a button to point at.
    const dismiss = screen.getByRole('button', {
      name: 'Dismiss Plain content',
    });
    expect(dismiss).not.toHaveAttribute('aria-expanded');
    expect(dismiss).not.toHaveAttribute('aria-controls');
    expect(
      screen.getByTestId('child-content').parentElement,
    ).not.toHaveAttribute('id');
  });

  it('starts open for collapsible={{defaultIsOpen: true}}', () => {
    render(
      <Banner status="info" title="Open" collapsible={{defaultIsOpen: true}}>
        <div data-testid="child-content">Content</div>
      </Banner>,
    );
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Collapse'})).toBeInTheDocument();
  });

  it('treats a null collapsible as the default', () => {
    render(
      // @ts-expect-error null is outside the prop's type, but JS callers and a
      // value widened to `| null` still reach this.
      <Banner status="info" title="Nullish" collapsible={null}>
        <div data-testid="child-content">Content</div>
      </Banner>,
    );
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Expand'})).toBeInTheDocument();
  });

  it('does not show expand/collapse button when no children', () => {
    render(<Banner status="info" title="No Children" />);
    expect(
      screen.queryByRole('button', {name: 'Expand'}),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'Collapse'}),
    ).not.toBeInTheDocument();
  });

  it('toggles children visibility on expand/collapse click', async () => {
    const user = userEvent.setup();
    render(
      <Banner status="info" title="Toggle Test">
        <div data-testid="child-content">Extra content</div>
      </Banner>,
    );

    // Initially collapsed
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Expand'})).toBeInTheDocument();

    // Click to expand
    await user.click(screen.getByRole('button', {name: 'Expand'}));
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Collapse'})).toBeInTheDocument();

    // Click to collapse
    await user.click(screen.getByRole('button', {name: 'Collapse'}));
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Expand'})).toBeInTheDocument();
  });

  it('reports open-state changes through onOpenChange', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Banner status="info" title="Notify" collapsible={{onOpenChange}}>
        <div data-testid="child-content">Extra content</div>
      </Banner>,
    );

    await user.click(screen.getByRole('button', {name: 'Expand'}));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole('button', {name: 'Collapse'}));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('defers to the consumer when collapsible is controlled', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Banner
        status="info"
        title="Controlled"
        collapsible={{isOpen: false, onOpenChange}}>
        <div data-testid="child-content">Extra content</div>
      </Banner>,
    );

    // A controlled banner must not move on its own: the click reports, the
    // content stays hidden until the consumer re-renders with isOpen.
    await user.click(screen.getByRole('button', {name: 'Expand'}));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
  });

  it('renders expand button to the left of dismiss button', () => {
    const {container} = render(
      <Banner status="info" title="Order Test" isDismissable>
        <div>Content</div>
      </Banner>,
    );
    const buttons = container.querySelectorAll('button');
    const buttonNames = Array.from(buttons).map(
      b => b.getAttribute('aria-label') || b.textContent,
    );
    const expandIndex = buttonNames.indexOf('Expand');
    const dismissIndex = buttonNames.indexOf('Dismiss Order Test');
    expect(expandIndex).toBeLessThan(dismissIndex);
  });

  it('links the expand toggle to its content region via aria-controls', () => {
    render(
      <Banner
        status="info"
        title="Controls Test"
        collapsible={{defaultIsOpen: true}}>
        <div data-testid="region-content">Region content</div>
      </Banner>,
    );

    const toggle = screen.getByRole('button', {name: 'Collapse'});
    const controlsId = toggle.getAttribute('aria-controls');
    // aria-controls must be present and point at the real content region.
    expect(controlsId).toBeTruthy();
    const region = document.getElementById(controlsId as string);
    expect(region).not.toBeNull();
    expect(region).toContainElement(screen.getByTestId('region-content'));
  });

  it('sets aria-controls only while the content region is mounted', async () => {
    const user = userEvent.setup();
    render(
      <Banner status="info" title="Controls Toggle">
        <div data-testid="region-content">Region content</div>
      </Banner>,
    );

    // Collapsed: the region is unmounted, so no dangling aria-controls target.
    const collapsedToggle = screen.getByRole('button', {name: 'Expand'});
    expect(collapsedToggle).not.toHaveAttribute('aria-controls');

    // Expanded: aria-controls resolves to the mounted region with the children.
    await user.click(collapsedToggle);
    const expandedToggle = screen.getByRole('button', {name: 'Collapse'});
    const controlsId = expandedToggle.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    const region = document.getElementById(controlsId as string);
    expect(region).not.toBeNull();
    expect(region).toContainElement(screen.getByTestId('region-content'));
  });

  it('does not render content area when no children', () => {
    const {container} = render(<Banner status="info" title="No Children" />);
    const root = container.firstElementChild;
    // Root should have only 1 child div: the header
    expect(root?.children).toHaveLength(1);
  });

  it('supports data-testid', () => {
    render(<Banner status="info" title="Test ID" data-testid="my-banner" />);
    expect(screen.getByTestId('my-banner')).toBeInTheDocument();
  });

  it('renders each status type correctly', () => {
    const statuses = ['info', 'warning', 'error', 'success'] as const;
    for (const status of statuses) {
      const {unmount} = render(
        <Banner status={status} title={`${status} banner`} />,
      );
      expect(screen.getByText(`${status} banner`)).toBeInTheDocument();
      unmount();
    }
  });

  it('forwards ref', () => {
    const ref = {current: null as HTMLDivElement | null};
    render(<Banner ref={ref} status="info" title="Ref Test" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  // =========================================================================
  // Status icon color theming (#4166)
  // =========================================================================

  it("carries the 'banner-icon' theme target on the default status icon glyph", () => {
    // Theme overrides for 'banner-icon' + 'status:X' compile to
    // '.astryx-banner-icon[data-status="<status>"]' (parseStyleKey). The target must sit on
    // the <Icon> span itself so those same-element rules in
    // @layer astryx-theme beat the Icon's own color variant.
    const statuses = ['info', 'warning', 'error', 'success'] as const;
    for (const status of statuses) {
      const {container, unmount} = render(
        <Banner status={status} title={`${status} banner`} />,
      );
      const glyph = container.querySelector(
        `.astryx-icon.astryx-banner-icon[data-status="${status}"]`,
      );
      expect(glyph).not.toBeNull();
      expect(glyph).toHaveAttribute('data-status', status);
      // Exactly one element carries the target — the layout wrapper no
      // longer does.
      expect(container.querySelectorAll('.astryx-banner-icon')).toHaveLength(1);
      unmount();
    }
  });

  it('keeps the color variant on the theme-target element (regression pin for #4166)', () => {
    // Pre-fix, '.astryx-banner-icon[data-status="info"]' matched the layout wrapper while
    // the color variant (data-color="accent") sat on an inner span that a
    // theme override could never reach. Target and paint now share one
    // element.
    const {container} = render(<Banner status="info" title="Info" />);
    const target = container.querySelector(
      '.astryx-banner-icon[data-status="info"]',
    );
    expect(target).toHaveAttribute('data-color', 'inherit');
  });

  it("keeps the 'banner-icon' target on the wrapper for a custom icon node", () => {
    // Core never injects props into consumer elements, so with a custom
    // `icon` the target stays on the (layout-only) wrapper and overrides
    // reach the node via inheritance. The node itself is untouched.
    const {container} = render(
      <Banner
        status="info"
        title="Custom icon"
        icon={<span data-testid="custom-glyph">i</span>}
      />,
    );
    const targets = container.querySelectorAll('.astryx-banner-icon');
    expect(targets).toHaveLength(1);
    expect(targets[0]?.tagName).toBe('DIV');
    expect(targets[0]).toHaveAttribute('aria-hidden', 'true');
    const custom = container.querySelector('[data-testid="custom-glyph"]');
    expect(custom).not.toBeNull();
    expect(custom?.className).toBe('');
  });

  // =========================================================================
  // Icon registry integration
  // =========================================================================

  it('uses icons from the global registry when registered', () => {
    registerIcons({
      info: (
        <svg data-testid="custom-registry-icon">
          <circle />
        </svg>
      ),
    });
    render(<Banner status="info" title="Registry Test" />);
    expect(screen.getByTestId('custom-registry-icon')).toBeInTheDocument();
  });

  it('uses chevronDown from the registry for expand/collapse', () => {
    registerIcons({
      chevronDown: (
        <svg data-testid="custom-chevron">
          <path d="M0 0" />
        </svg>
      ),
    });
    render(
      <Banner status="info" title="Chevron Test">
        <div>Content</div>
      </Banner>,
    );
    expect(screen.getByTestId('custom-chevron')).toBeInTheDocument();
  });

  describe('elevation', () => {
    it("carries the 'banner-frame' target and its visual axes on the outer painter", () => {
      const containers = ['card', 'section'] as const;
      const elevations = ['none', 'low', 'med', 'high'] as const;

      for (const containerType of containers) {
        for (const elevation of elevations) {
          const {container, unmount} = render(
            <Banner
              status="info"
              title="Heads up"
              container={containerType}
              elevation={elevation}
            />,
          );
          const frame = container.firstElementChild;
          expect(frame).toHaveClass('astryx-banner-frame');
          // Visual axes are reflected only as canonical data attributes.
          expect(frame).not.toHaveClass(containerType);
          expect(frame).not.toHaveClass(elevation);
          expect(frame).toHaveAttribute('data-container', containerType);
          expect(frame).toHaveAttribute('data-elevation', elevation);
          expect(frame?.firstElementChild).toHaveClass('astryx-banner');
          expect(frame?.firstElementChild).not.toHaveClass(
            'astryx-banner-frame',
          );
          unmount();
        }
      }
    });

    it('lets a theme set frame shadow and radius without a structural selector', () => {
      const theme = defineTheme({
        name: 'banner-frame-test',
        components: {
          'banner-frame': {
            'container:card+elevation:high': {
              boxShadow: 'var(--shadow-high)',
              borderRadius: 'var(--radius-element)',
            },
          },
        },
      });
      const {component: css} = generateThemeCSS(theme);

      expect(css).toContain(
        '.astryx-banner-frame[data-container="card"][data-elevation="high"]',
      );
      expect(css).toContain('box-shadow: var(--shadow-high)');
      expect(css).toContain('border-radius: var(--radius-element)');
      expect(css).not.toContain(':has(');
    });

    it('renders a distinct root class for each elevation level', () => {
      const classFor = (elevation: 'none' | 'low' | 'med' | 'high') => {
        const {container} = render(
          <Banner status="info" title="Heads up" elevation={elevation} />,
        );
        return container.firstElementChild!.className;
      };
      const classes = new Set([
        classFor('none'),
        classFor('low'),
        classFor('med'),
        classFor('high'),
      ]);
      expect(classes.size).toBe(4);
    });

    it('defaults to flat (elevation none)', () => {
      const {container: def} = render(
        <Banner status="info" title="Heads up" />,
      );
      const {container: none} = render(
        <Banner status="info" title="Heads up" elevation="none" />,
      );
      expect(def.firstElementChild!.className).toBe(
        none.firstElementChild!.className,
      );
    });
  });

  describe('dismiss focus handoff', () => {
    it('returns focus to where it came from instead of dropping it to body', async () => {
      const user = userEvent.setup();
      render(
        <>
          <button type="button">Before</button>
          <Banner status="info" title="Heads up" isDismissable />
        </>,
      );
      const before = screen.getByRole('button', {name: 'Before'});
      before.focus();

      await user.tab();
      expect(
        screen.getByRole('button', {name: 'Dismiss Heads up'}),
      ).toHaveFocus();

      await user.keyboard('{Enter}');

      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(before).toHaveFocus();
      expect(document.activeElement).not.toBe(document.body);
    });

    it('leaves focus alone when it never entered the banner', async () => {
      const user = userEvent.setup();
      render(
        <>
          <button type="button">Elsewhere</button>
          <Banner status="info" title="Heads up" isDismissable />
        </>,
      );
      await user.click(screen.getByRole('button', {name: 'Dismiss Heads up'}));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('empty slots', () => {
    it('does not show the expand affordance for children that render nothing', () => {
      render(
        <Banner status="info" title="Heads up">
          {false}
        </Banner>,
      );
      expect(
        screen.queryByRole('button', {name: 'Expand'}),
      ).not.toBeInTheDocument();
    });

    it('still shows the expand affordance for real children', () => {
      render(
        <Banner status="info" title="Heads up">
          <p>Detail</p>
        </Banner>,
      );
      expect(screen.getByRole('button', {name: 'Expand'})).toBeInTheDocument();
    });

    it('renders no content area for children that render nothing', () => {
      const {container} = render(
        <Banner status="info" title="Heads up" collapsible={false}>
          {false}
        </Banner>,
      );
      // Header only — an empty slot must not draw the card-background area.
      expect(container.firstElementChild?.children).toHaveLength(1);
    });

    it('renders no description node for a description that renders nothing', () => {
      const {container} = render(
        <Banner status="info" title="Heads up" description="" />,
      );
      const header = container.firstElementChild!.firstElementChild!;
      // icon wrapper + text column, and the text column holds the title alone
      expect(header.children[1].children).toHaveLength(1);
    });
  });

  // jsdom does no flex layout, so these read the declarations that produce the
  // wrap. The rendered result is verified in Chromium at 320/375/480/768.
  describe('narrow-viewport wrapping', () => {
    const renderBanner = (endContent?: React.ReactNode) => {
      const {container} = render(
        <Banner
          status="warning"
          title="A compute node is required"
          endContent={endContent}
        />,
      );
      const header = container.firstElementChild!.firstElementChild!;
      return {
        header,
        textColumn: screen.getByText('A compute node is required')
          .parentElement!,
      };
    };

    it('lets the header wrap so the end area can take its own row', () => {
      const {header} = renderBanner(<button type="button">Retry</button>);
      expect(getComputedStyle(header).flexWrap).toBe('wrap');
    });

    it('gives the text column a wrap threshold when endContent is present', () => {
      const {textColumn} = renderBanner(<button type="button">Retry</button>);
      expect(getComputedStyle(textColumn).flexBasis).toBe('8rem');
    });

    it('leaves the text column free to shrink when there is no endContent', () => {
      const {textColumn} = renderBanner();
      expect(getComputedStyle(textColumn).flexBasis).not.toBe('8rem');
    });

    it('leaves it free for an endContent that renders nothing', () => {
      const {textColumn} = renderBanner(false);
      expect(getComputedStyle(textColumn).flexBasis).not.toBe('8rem');
    });
  });

  describe('dismiss control naming', () => {
    it('names stacked string-title banners distinctly', () => {
      render(
        <>
          <Banner status="error" title="Upload invoice failed" isDismissable />
          <Banner status="error" title="Delete report failed" isDismissable />
        </>,
      );
      const buttons = screen.getAllByRole('button');
      expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual([
        'Dismiss Upload invoice failed',
        'Dismiss Delete report failed',
      ]);
      for (const button of buttons) {
        expect(button).toHaveAccessibleDescription('Dismiss');
      }
    });

    it('keeps the bare name and tooltip for a rich title', () => {
      render(
        <Banner status="info" title={<span>Rich title</span>} isDismissable />,
      );
      const button = screen.getByRole('button', {name: 'Dismiss'});
      expect(button).toHaveAccessibleDescription('Dismiss');
    });

    it('uses a translated dismissLabel for a rich title and its tooltip', () => {
      render(
        <Banner
          status="info"
          title={<span>Wartungshinweis</span>}
          isDismissable
          dismissLabel="Wartungshinweis schließen"
        />,
      );
      const button = screen.getByRole('button', {
        name: 'Wartungshinweis schließen',
      });
      expect(button).toHaveAccessibleDescription('Wartungshinweis schließen');
    });

    it('keeps a translated verb when the titled message falls back to English', () => {
      render(
        <InternationalizationProvider
          locale="de-DE"
          overrides={{
            'de-DE': {'@astryx.banner.dismiss': 'Schließen'},
          }}>
          <Banner status="info" title="Wartungshinweis" isDismissable />
        </InternationalizationProvider>,
      );
      const button = screen.getByRole('button', {
        name: 'Schließen Wartungshinweis',
      });
      expect(button).toHaveAccessibleDescription('Schließen');
    });
  });
});

// jsdom cannot emulate forced colors, so this asserts the compiled rule the
// status fill relies on (architecture:theme-tokens INV11): the fill becomes
// Canvas, and a CanvasText boundary keeps its shape.
describe('Banner forced colors', () => {
  it('keeps a visible boundary on the status fill', () => {
    render(<Banner status="error" title="Upload failed" />);
    const css = getForcedColorsRules();
    expect(css).toContain('outline-style: solid;');
    expect(css).toContain('outline-color: canvastext;');
  });
});
