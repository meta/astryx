// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Spinner.test.tsx
 * @input Uses vitest, @testing-library/react, Spinner component
 * @output Unit tests for Spinner component behavior
 * @position Testing; validates Spinner.tsx implementation
 *
 * SYNC: When Spinner.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {createRef, StrictMode} from 'react';
import {render, screen} from '@testing-library/react';
import {Spinner} from './Spinner';
import {SpinnerOwnerContext} from './SpinnerOwnerContext';
import {InternationalizationProvider} from '../i18n';
import {defineTheme} from '../theme/defineTheme';
import {generateThemeCSS} from '../theme/generateThemeRules';

const {announce} = vi.hoisted(() => ({announce: vi.fn()}));
vi.mock('../hooks/useAnnounce', () => ({useAnnounce: () => announce}));

beforeEach(() => {
  announce.mockClear();
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
});

afterEach(() => vi.restoreAllMocks());

/** sm/md/lg/xl, as Spinner.tsx defines them. */
const SIZES = {
  sm: {diameter: 10, border: 2},
  md: {diameter: 14, border: 3},
  lg: {diameter: 18, border: 3},
  xl: {diameter: 28, border: 4},
} as const;

const ring = (testId = 'spinner') =>
  screen.getByTestId(testId).querySelector('svg') as SVGSVGElement;

const circles = (testId = 'spinner') => {
  const [track, arc] = [...ring(testId).querySelectorAll('circle')];
  return {track, arc};
};

const dashOf = (el: SVGCircleElement) =>
  (el.getAttribute('stroke-dasharray') ?? '').split(/[\s,]+/).map(Number);

describe('Spinner', () => {
  it('renders with default props', () => {
    render(<Spinner data-testid="spinner" />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(announce).toHaveBeenCalledExactlyOnceWith('Loading', 'polite');
  });

  it('renders with size sm', () => {
    render(<Spinner size="sm" data-testid="spinner" />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('renders with size md', () => {
    render(<Spinner size="md" data-testid="spinner" />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('renders with size lg', () => {
    render(<Spinner size="lg" data-testid="spinner" />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('renders with shade default', () => {
    render(<Spinner shade="default" data-testid="spinner" />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('renders with shade onMedia', () => {
    render(<Spinner shade="onMedia" data-testid="spinner" />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('renders with shade inherit', () => {
    render(<Spinner shade="inherit" data-testid="spinner" />);
    const spinner = screen.getByTestId('spinner');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveAttribute('data-shade', 'inherit');
  });

  it('localizes the default assistive label through the i18n catalog', () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{fr: {'@astryx.spinner.loading': 'Chargement'}}}>
        <Spinner data-testid="spinner" />
      </InternationalizationProvider>,
    );
    expect(screen.getByTestId('spinner')).toHaveAttribute(
      'aria-label',
      'Chargement',
    );
    expect(announce).toHaveBeenCalledExactlyOnceWith('Chargement', 'polite');
  });

  it('keeps an explicit aria-label over the localized default', () => {
    render(
      <InternationalizationProvider
        locale="fr"
        overrides={{fr: {'@astryx.spinner.loading': 'Chargement'}}}>
        <Spinner aria-label="Veuillez patienter" data-testid="spinner" />
      </InternationalizationProvider>,
    );
    expect(screen.getByTestId('spinner')).toHaveAttribute(
      'aria-label',
      'Veuillez patienter',
    );
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      'Veuillez patienter',
      'polite',
    );
  });

  it('does not duplicate a visible string label as aria-label', () => {
    render(<Spinner label="Fetching data" data-testid="spinner" />);
    const image = screen.getByRole('progressbar', {name: 'Fetching data'});
    expect(image).not.toHaveAttribute('aria-label');
    expect(image).toHaveAttribute('aria-labelledby');
  });

  it('uses explicit aria-label over string label', () => {
    render(
      <Spinner
        label="Loading..."
        aria-label="Please wait"
        data-testid="spinner"
      />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-label',
      'Please wait',
    );
  });

  it('renders label content below the spinner', () => {
    render(<Spinner label="Loading..." data-testid="spinner" />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders ReactNode label', () => {
    render(
      <Spinner
        label={<span data-testid="custom-label">Custom content</span>}
        aria-label="Loading"
        data-testid="spinner"
      />,
    );
    expect(screen.getByTestId('custom-label')).toBeInTheDocument();
  });

  it('defaults aria-label to "Loading" for ReactNode label without explicit aria-label', () => {
    render(<Spinner label={<span>Rich content</span>} data-testid="spinner" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-label',
      'Loading',
    );
  });

  it('accepts data-testid', () => {
    render(<Spinner data-testid="my-spinner" />);
    expect(screen.getByTestId('my-spinner')).toBeInTheDocument();
  });

  it('renders as an inline element (span)', () => {
    render(<Spinner data-testid="spinner" />);
    const spinner = screen.getByTestId('spinner');
    expect(spinner.tagName.toLowerCase()).toBe('span');
  });

  // The box has always been sized by an inline width/height written after the
  // caller's `style`, so the component's own size wins over a `style={{width}}`
  // passed in. Making the geometry themeable changed what that value is made
  // of — a composed var rather than a number — and deliberately not where it is
  // written: moving the sizing into a rule would have handed a caller's inline
  // width a precedence over the box it has never had. This pins the precedence
  // itself, which is the part a consumer could be depending on.
  describe('box sizing', () => {
    it.each(Object.entries(SIZES))(
      'falls back to the %s frame where no stylesheet has declared the var',
      (size, {diameter, border}) => {
        render(
          <Spinner size={size as keyof typeof SIZES} data-testid="spinner" />,
        );
        const box = screen.getByTestId('spinner');
        const expected = `var(--_spinner-box-size, ${diameter + border * 2}px)`;
        expect(box.style.width).toBe(expected);
        expect(box.style.height).toBe(expected);
      },
    );

    it('keeps its own size over a width the caller passes in style', () => {
      render(
        <Spinner
          size="xl"
          style={{width: 999, height: 999, opacity: 0.5}}
          data-testid="spinner"
        />,
      );
      const box = screen.getByTestId('spinner');
      expect(box.style.width).toBe('var(--_spinner-box-size, 36px)');
      expect(box.style.height).toBe('var(--_spinner-box-size, 36px)');
      // Everything else the caller passed still applies — only the two
      // properties the box owns are taken back.
      expect(box.style.opacity).toBe('0.5');
    });
  });

  // The themed geometry resolves in the cascade — jsdom implements no layout
  // and no custom-property registration, so no test here can reach what a
  // theme actually draws; that is verified in a browser and the numbers are in
  // the PR. What IS a contract a unit test can hold is the routing: a theme
  // writes an override against the documented key, and it has to come out on
  // the selector the component reads from.
  describe('a theme reaches the spinner through its public vars', () => {
    const cssFor = (
      components: Parameters<typeof defineTheme>[0]['components'],
    ) =>
      generateThemeCSS(defineTheme({name: 'spinner-theming', components}))
        .component;

    it('scopes a themed size to that size variant', () => {
      // Asserting the whole rule, not just the declaration: the same var on
      // the bare `.astryx-spinner` would resize every size at once, which is
      // the bug a size-variant key exists to avoid.
      expect(
        cssFor({spinner: {'size:xl': {'--spinner-diameter': '2.5rem'}}}),
      ).toContain(
        '.astryx-spinner[data-size="xl"] {\n    --spinner-diameter: 2.5rem;',
      );
    });

    it('scopes a themed color to that shade variant', () => {
      expect(
        cssFor({
          spinner: {'shade:subtle': {'--spinner-track-color': 'transparent'}},
        }),
      ).toContain(
        '.astryx-spinner[data-shade="subtle"] {\n    --spinner-track-color: transparent;',
      );
    });

    it('lets the base target set a value for every size and shade', () => {
      expect(
        cssFor({spinner: {base: {'--spinner-color': 'var(--color-brand)'}}}),
      ).toContain(
        '.astryx-spinner {\n    --spinner-color: var(--color-brand);',
      );
    });

    it('scopes a themed arc fraction to that size variant (#5819)', () => {
      expect(
        cssFor({spinner: {'size:xl': {'--spinner-arc-fraction': '0.75'}}}),
      ).toContain(
        '.astryx-spinner[data-size="xl"] {\n    --spinner-arc-fraction: 0.75;',
      );
    });
  });
});

describe('Spinner ring', () => {
  it('draws the ring in SVG', () => {
    render(<Spinner data-testid="spinner" />);
    const svg = ring();
    expect(svg).not.toBeNull();
    expect(svg.querySelectorAll('circle')).toHaveLength(2);
    expect(screen.getByTestId('spinner').querySelector('canvas')).toBeNull();
  });

  it.each(Object.entries(SIZES))(
    'sizes the %s ring from its size token',
    (size, {diameter, border}) => {
      render(
        <Spinner size={size as keyof typeof SIZES} data-testid="spinner" />,
      );
      // No viewBox: one user unit is one px, so the attributes below mean px.
      // They are the no-stylesheet fallback; CSS sizes the frame from the box.
      const frame = diameter + border * 2;
      const svg = ring();
      expect(svg.getAttribute('viewBox')).toBeNull();
      expect(Number(svg.getAttribute('width'))).toBe(frame);
      expect(Number(svg.getAttribute('height'))).toBe(frame);
      for (const c of [circles().track, circles().arc]) {
        expect(c.getAttribute('cx')).toBe('50%');
        expect(c.getAttribute('cy')).toBe('50%');
        expect(Number(c.getAttribute('r'))).toBe(diameter / 2);
        expect(Number(c.getAttribute('stroke-width'))).toBe(border);
      }
    },
  );

  // The canvas ring swept 135deg, not the 270deg its SPREAD comment claimed.
  it.each(Object.entries(SIZES))(
    'sweeps 135 degrees at %s',
    (size, {diameter}) => {
      render(
        <Spinner size={size as keyof typeof SIZES} data-testid="spinner" />,
      );
      const {track, arc} = circles();
      const [on, off] = dashOf(arc);
      expect(on + off).toBeCloseTo(Math.PI * diameter, 6);
      expect((on / (on + off)) * 360).toBeCloseTo(135, 6);
      expect(track.getAttribute('stroke-dasharray')).toBeNull();
    },
  );

  // The regression this file could not have caught: #5214 made the RING
  // themeable and left the frame at the size's own constant, so a themed
  // diameter left the svg larger than the box it sits in. The overflowing grid
  // item then aligned to start rather than centre — measured in Chromium at
  // 1.5 to 3.3px off across the four sizes. Nothing asserted the two agreed,
  // because nothing tied them.
  it('sizes the frame from CSS, not from the size constant', () => {
    render(<Spinner data-testid="spinner" />);
    const svg = ring();
    // No viewBox, and the circles centre on the box rather than on a centre
    // in user units — together that is what lets CSS size the frame from
    // `--_spinner-box-size`, the same composed var the span is sized from, so
    // a themed diameter moves both. The px attributes remain as the
    // no-stylesheet fallback and CSS outranks them whenever one is present.
    expect(svg.getAttribute('viewBox')).toBeNull();
    for (const c of [circles().track, circles().arc]) {
      expect(c.getAttribute('cx')).toBe('50%');
      expect(c.getAttribute('cy')).toBe('50%');
    }
  });

  it('starts the arc at twelve o’clock', () => {
    render(<Spinner data-testid="spinner" />);
    // A CSS rotation about the shape's own box, not an SVG transform about a
    // centre in user units — the centre is `50%`, so there is no user-unit
    // number to name, and the offset has to survive a themed diameter.
    expect(circles().arc.getAttribute('transform')).toBeNull();
  });

  // The authored dash is the size's own absolute pattern, and stays that way:
  // it is what a render with no stylesheet draws, and it is byte-for-byte the
  // pattern this component drew before the geometry became themeable. Scaling
  // with a themed diameter is the rule's job — it composes the same two
  // lengths out of the resolved diameter — and deliberately not `pathLength`'s,
  // which rescales against the path length the UA measures on its own
  // approximation of the circle and shortens the default arc by 0.64%.
  it.each(Object.entries(SIZES))(
    'leaves the %s arc its own absolute dash, with no pathLength',
    (size, {diameter}) => {
      render(
        <Spinner size={size as keyof typeof SIZES} data-testid="spinner" />,
      );
      const {track, arc} = circles();
      const [on, off] = dashOf(arc);
      expect(on + off).toBeCloseTo(Math.PI * diameter, 6);
      expect(arc.getAttribute('pathLength')).toBeNull();
      // The track is a full ring, so it needs neither.
      expect(track.getAttribute('pathLength')).toBeNull();
    },
  );

  // The whole point of the SVG ring: the colours come off the cascade, so
  // nothing has to resolve them in JS. A read reaching the paint path again
  // fails here.
  it.each(['default', 'subtle', 'onMedia', 'inherit'] as const)(
    'reads no computed style to paint the %s shade',
    shade => {
      const spy = vi.spyOn(window, 'getComputedStyle');
      render(<Spinner shade={shade} data-testid="spinner" />);
      const spinner = screen.getByTestId('spinner');
      const onSpinner = spy.mock.calls.filter(
        ([el]) => el instanceof Element && spinner.contains(el),
      );
      expect(onSpinner).toEqual([]);
    },
  );

  it('schedules no frame where the Web Animations API is absent', () => {
    expect(SVGElement.prototype).not.toHaveProperty('getAnimations');
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    render(<Spinner data-testid="spinner" />);
    expect(ring()).not.toBeNull();
    expect(raf).not.toHaveBeenCalled();
  });

  it('pins every ring to the timeline origin in a single frame', () => {
    const animations: {startTime: number | null}[] = [];
    const getAnimations = vi.fn(function (this: SVGElement) {
      const a = {startTime: null as number | null};
      animations.push(a);
      return [a];
    });
    Object.defineProperty(SVGElement.prototype, 'getAnimations', {
      value: getAnimations,
      configurable: true,
      writable: true,
    });
    const frames: FrameRequestCallback[] = [];
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(cb => {
        frames.push(cb);
        return frames.length;
      });
    const computed = vi.spyOn(window, 'getComputedStyle');

    try {
      const {container} = render(
        <>
          {Array.from({length: 5}, (_, i) => (
            <Spinner key={i} />
          ))}
        </>,
      );
      // One frame for five spinners: the reads are batched, so no mount
      // re-forces what the previous mount invalidated.
      expect(raf).toHaveBeenCalledTimes(1);
      frames.forEach(cb => cb(0));
      expect(animations).toHaveLength(5);
      expect(animations.every(a => a.startTime === 0)).toBe(true);
      // The dash animation lives on the arc <circle>, a descendant of the
      // <svg> this ref sits on, not the <svg> itself (#6253) — subtree:true
      // is what lets getAnimations() find it from here.
      expect(getAnimations).toHaveBeenCalledWith({subtree: true});
      // The pin runs on the branch the other shade cases cannot reach, so the
      // no-read assertion is made here too.
      expect(
        computed.mock.calls.filter(
          ([el]) => el instanceof Element && container.contains(el),
        ),
      ).toEqual([]);
    } finally {
      // @ts-expect-error — removing the stub restores jsdom's real surface
      delete SVGElement.prototype.getAnimations;
    }
  });
});

describe('geometry var registration', () => {
  /** The shape `registerSpinnerVars` passes; jsdom implements no real one. */
  type Descriptor = {
    name: string;
    syntax: string;
    inherits: boolean;
    initialValue: string;
  };
  const stubRegisterProperty = (fn: (d: Descriptor) => void) => {
    (
      CSS as unknown as {registerProperty: (d: Descriptor) => void}
    ).registerProperty = fn;
  };

  afterEach(() => {
    delete (CSS as unknown as {registerProperty?: unknown}).registerProperty;
    vi.resetModules();
  });

  it('registers when the module is imported, not when a spinner mounts', async () => {
    // Registering an inherited property with an `initial-value` invalidates
    // style for the whole document. A spinner mounts onto a page that has
    // already rendered, so paying it there is paying it on the full tree —
    // measured at 29ms against 12ms on an 11k-element page. At import the page
    // is whatever has rendered so far, which for a bundle in the head is
    // nothing. This pins the timing: it fails if the call moves back into a
    // ref callback, an effect, or the component body.
    const registerProperty = vi.fn<(d: Descriptor) => void>();
    stubRegisterProperty(registerProperty);

    vi.resetModules();
    await import('./Spinner');

    expect(registerProperty.mock.calls.map(([d]) => d.name)).toEqual([
      '--_spinner-ring-diameter',
      '--_spinner-ring-stroke',
    ]);
    // Both are `<length>` with an initial value, which is what makes a themed
    // `0` mean `0px` inside the `calc()` rather than poisoning it.
    for (const [descriptor] of registerProperty.mock.calls) {
      expect(descriptor.syntax).toBe('<length>');
      expect(descriptor.inherits).toBe(true);
      expect(descriptor.initialValue).toBe('0px');
    }
  });

  it('survives a second evaluation, and does not need the DOM', async () => {
    // Two copies of the package on one page, or a fast-refresh re-evaluation:
    // registerProperty throws on a duplicate rather than replacing, and the
    // existing registration is this same one.
    const registerProperty = vi.fn<(d: Descriptor) => void>(() => {
      throw new Error('InvalidModificationError');
    });
    stubRegisterProperty(registerProperty);

    vi.resetModules();
    await expect(import('./Spinner')).resolves.toBeDefined();
    expect(registerProperty).toHaveBeenCalledTimes(2);
  });
});

describe('shared announcement lifecycle', () => {
  it('announces once per appearance, including a new appearance with the same words', () => {
    const view = (loading: boolean) => (
      <StrictMode>{loading && <Spinner label="Loading results" />}</StrictMode>
    );
    const {rerender} = render(view(false));
    expect(announce).not.toHaveBeenCalled();

    rerender(view(true));
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      'Loading results',
      'polite',
    );
    rerender(view(true));
    expect(announce).toHaveBeenCalledTimes(1);

    rerender(view(false));
    rerender(view(true));
    expect(announce.mock.calls).toEqual([
      ['Loading results', 'polite'],
      ['Loading results', 'polite'],
    ]);
  });

  it('announces when the label changes', () => {
    const {rerender} = render(<Spinner label="Loading results" />);

    expect(announce).toHaveBeenCalledExactlyOnceWith(
      'Loading results',
      'polite',
    );

    rerender(<Spinner label="Saving results" />);

    expect(announce.mock.calls).toEqual([
      ['Loading results', 'polite'],
      ['Saving results', 'polite'],
    ]);
  });

  it('stays silent with a caller role other than progressbar, as it shipped (AST-017 FR53)', () => {
    const {rerender} = render(<Spinner aria-label="Searching" role="img" />);
    rerender(<Spinner aria-label="Searching again" role="img" />);
    expect(
      screen.getByRole('img', {name: 'Searching again'}),
    ).toBeInTheDocument();
    expect(announce).not.toHaveBeenCalled();

    rerender(<Spinner aria-label="Searching once more" />);
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      'Searching once more',
      'polite',
    );
  });

  it('stays silent inside a Core owner, and announces once it stands alone (AST-086 FR8)', () => {
    const {rerender} = render(
      <SpinnerOwnerContext value={true}>
        <Spinner aria-label="Loading results" />
      </SpinnerOwnerContext>,
    );
    expect(
      screen.getByRole('progressbar', {name: 'Loading results'}),
    ).toBeInTheDocument();
    expect(announce).not.toHaveBeenCalled();

    rerender(
      <SpinnerOwnerContext value={false}>
        <Spinner aria-label="Loading results" />
      </SpinnerOwnerContext>,
    );
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      'Loading results',
      'polite',
    );
  });

  it('stays silent when app code hides it with aria-hidden', () => {
    const {rerender} = render(<Spinner label="Loading events" aria-hidden />);
    rerender(<Spinner label="Loading events" aria-hidden />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('announces a stacked rich label word by word, not run together (AST-086 FR7)', () => {
    const {rerender} = render(<div />);
    rerender(
      <Spinner
        aria-label="Fetching data"
        label={
          <div style={{display: 'flex', flexDirection: 'column'}}>
            <span>Fetching data</span>
            <span>This may take a moment</span>
          </div>
        }
      />,
    );
    expect(announce).toHaveBeenCalledWith(
      'Fetching data This may take a moment',
      'polite',
    );
  });

  it('keeps directly hidden and ancestor-hidden indicators silent', () => {
    render(
      <>
        <Spinner aria-hidden="true" role={undefined} />
        <Spinner aria-hidden="true" label="Decorative label" />
        <div aria-hidden="true">
          <Spinner />
        </div>
        <div hidden>
          <Spinner />
        </div>
      </>,
    );
    expect(announce).not.toHaveBeenCalled();
  });

  it('leaves announcements to existing live containers', () => {
    const view = (loading: boolean) => (
      <>
        <div role="log">{loading && <Spinner />}</div>
        <div aria-live="polite">{loading && <Spinner />}</div>
        <div aria-live="assertive">{loading && <Spinner />}</div>
      </>
    );
    const {rerender} = render(view(false));
    rerender(view(true));
    expect(announce).not.toHaveBeenCalled();
  });

  it('preserves refs when switching between labeled and unlabeled roots', () => {
    const ref = createRef<HTMLSpanElement>();
    const {rerender, unmount} = render(
      <Spinner ref={ref} data-testid="spinner" />,
    );
    expect(ref.current).toBe(screen.getByTestId('spinner'));
    rerender(
      <Spinner ref={ref} label="Loading results" data-testid="spinner" />,
    );
    expect(ref.current).toBe(screen.getByTestId('spinner'));
    expect(announce).toHaveBeenLastCalledWith('Loading results', 'polite');
    unmount();
    expect(ref.current).toBeNull();
  });

  it('stays silent during page load and announces a later text change', () => {
    const readyState = vi
      .spyOn(document, 'readyState', 'get')
      .mockReturnValue('loading');
    const {rerender} = render(<Spinner aria-label="Loading records" />);
    expect(announce).not.toHaveBeenCalled();
    readyState.mockReturnValue('complete');
    rerender(<Spinner aria-label="Loading records" />);
    expect(announce).not.toHaveBeenCalled();
    rerender(<Spinner aria-label="Saving records" />);
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      'Saving records',
      'polite',
    );
  });

  it('announces rendered ReactNode text and changes without changing the progressbar name', () => {
    function LoadingLabel() {
      return (
        <span>
          <strong>Fetch</strong>ing records
          <span aria-hidden="true"> decoration</span>
          <span hidden> hidden</span>
        </span>
      );
    }
    const {rerender} = render(
      <Spinner label={<LoadingLabel />} aria-label="Please wait" />,
    );
    expect(screen.getByRole('progressbar')).toHaveAccessibleName('Please wait');
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      'Fetching records',
      'polite',
    );
    rerender(<Spinner label={<LoadingLabel />} aria-label="Please wait" />);
    expect(announce).toHaveBeenCalledTimes(1);
    rerender(
      <Spinner label={<em>Saving records</em>} aria-label="Please wait" />,
    );
    expect(screen.getByRole('progressbar')).toHaveAccessibleName('Please wait');
    expect(announce.mock.calls).toEqual([
      ['Fetching records', 'polite'],
      ['Saving records', 'polite'],
    ]);
  });

  it('announces the aria-labelledby name and its updates instead of the default', () => {
    const view = (name: string) => (
      <>
        <Spinner aria-labelledby="upload-label" aria-label="Please wait" />
        <span id="upload-label">{name}</span>
      </>
    );
    const {rerender} = render(view('Uploading files'));
    expect(screen.getByRole('progressbar')).toHaveAccessibleName(
      'Uploading files',
    );
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      'Uploading files',
      'polite',
    );
    rerender(view('Uploading files'));
    expect(announce).toHaveBeenCalledTimes(1);
    rerender(view('Saving files'));
    expect(screen.getByRole('progressbar')).toHaveAccessibleName(
      'Saving files',
    );
    expect(announce.mock.calls).toEqual([
      ['Uploading files', 'polite'],
      ['Saving files', 'polite'],
    ]);
  });

  it('uses the accessible-name fallback for a textless ReactNode label', () => {
    render(<Spinner label={<span aria-hidden="true">Decoration</span>} />);
    expect(announce).toHaveBeenCalledExactlyOnceWith('Loading', 'polite');
  });
});
