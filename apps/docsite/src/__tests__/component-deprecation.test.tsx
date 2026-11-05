// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

/**
 * @file A deprecated component's page labels it by the title and leads with a
 * notice naming the replacement and linking to its page; a current
 * component's page shows neither. Both read the registry entry's
 * `deprecated`, generated from the component doc.
 */

import {cleanup, render, screen, within} from '@testing-library/react';
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {components} from '../generated/componentRegistry';
import {
  DEPRECATED_LABEL,
  DeprecatedBadge,
  DeprecationNotice,
} from '../components/Deprecation';
import {ComponentDetailClient} from '../components/component-detail/ComponentDetailClient';
import ComponentsGalleryPage from '../app/(docs)/components/page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/components/Example',
  useRouter: () => ({replace: () => {}, push: () => {}}),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@stylexjs/stylex', () => ({
  create: <T,>(styles: T) => styles,
  props: () => ({}),
  defineVars: <T,>(vars: T) => vars,
  defineConsts: <T,>(consts: T) => consts,
}));
// The page's previews and tabs are not under test; keep the article light.
vi.mock('../components/component-detail/ShowcasePreview', () => ({
  ShowcasePreview: () => null,
}));
vi.mock('../components/component-detail/PlaygroundPropsTable', () => ({
  PlaygroundPropsTable: () => null,
}));
vi.mock('../components/ShowcaseThumbnail', () => ({
  ShowcaseThumbnail: () => null,
}));
// The playground's theme objects need built theme packages, which the data
// job does not build; the presentation under test reads none of them.
vi.mock('../generated/themeRegistry', () => ({themeObjectsFull: {}}));

// jsdom has no matchMedia; the page's responsive hooks only need an answer.
beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
});
afterEach(cleanup);

const all = Object.entries(components).flatMap(([pkg, entries]) =>
  entries.map(entry => ({pkg, entry})),
);

describe('deprecation presentation', () => {
  const deprecation = {
    replacement: 'NewThing',
    replacementDisplayName: 'New Thing',
    description: 'Render a NewThing with steps instead.',
  };

  it('the notice states the status, names the replacement, and links to it', () => {
    render(<DeprecationNotice deprecation={deprecation} />);
    expect(
      screen.getByText(`${DEPRECATED_LABEL}: use New Thing instead`),
    ).toBeTruthy();
    expect(screen.getByText(deprecation.description)).toBeTruthy();
    expect(
      screen.getByRole('link', {name: 'View New Thing'}).getAttribute('href'),
    ).toBe('/components/NewThing');
  });

  it('the badge reads Deprecated, in the neutral variant', () => {
    render(<DeprecatedBadge />);
    expect(
      screen
        .getByText(DEPRECATED_LABEL)
        .closest('.astryx-badge')
        ?.getAttribute('data-variant'),
    ).toBe('neutral');
  });

  it("a deprecated component's page shows the badge in its header line and the notice before its content", () => {
    const found = all.find(({entry}) => entry.deprecated);
    expect(found).toBeDefined();
    const {pkg, entry} = found!;
    render(
      <ComponentDetailClient
        comp={entry}
        pkg={pkg}
        pkgVersion="0.0.0"
        showcase={undefined}
      />,
    );
    const title = screen.getByText(entry.displayName, {
      selector: '.astryx-text, span, p, div',
    });
    // The header's second line: package, version, module, then the badge.
    const headerLine = title.nextElementSibling as HTMLElement;
    expect(headerLine.textContent).toContain(` · ${entry.moduleName}`);
    expect(within(headerLine).getByText(DEPRECATED_LABEL)).toBeTruthy();
    const notice = screen.getByText(
      `${DEPRECATED_LABEL}: use ${entry.deprecated!.replacementDisplayName} instead`,
    );
    // The notice sits below the header and above the tabs.
    // The tab renders its label twice (one copy hidden, for width).
    const [overviewTab] = screen.getAllByText('Overview');
    expect(
      headerLine.compareDocumentPosition(notice) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      notice.compareDocumentPosition(overviewTab) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', {
          name: `View ${entry.deprecated!.replacementDisplayName}`,
        })
        .getAttribute('href'),
    ).toBe(`/components/${entry.deprecated!.replacement}`);
  });

  it('a deprecated component with a stability shows both badges in the header line, stability first', () => {
    const {pkg, entry} = all.find(({entry}) => entry.deprecated)!;
    render(
      <ComponentDetailClient
        comp={{...entry, stability: 'experimental'}}
        pkg={pkg}
        pkgVersion="0.0.0"
        showcase={undefined}
      />,
    );
    const title = screen.getByText(entry.displayName, {
      selector: '.astryx-text, span, p, div',
    });
    const headerLine = title.nextElementSibling as HTMLElement;
    const stability = within(headerLine).getByText('Experimental');
    const deprecated = within(headerLine).getByText(DEPRECATED_LABEL);
    expect(
      stability.compareDocumentPosition(deprecated) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('the components index labels the deprecated tile, and only it', () => {
    const {container} = render(<ComponentsGalleryPage />);
    const deprecatedNames = new Set(
      all.filter(({entry}) => entry.deprecated).map(({entry}) => entry.name),
    );
    const tiles = [
      ...container.querySelectorAll<HTMLAnchorElement>(
        'a[href^="/components/"]',
      ),
    ];
    expect(tiles.length).toBeGreaterThan(0);
    let labeled = 0;
    for (const tile of tiles) {
      const name = tile.getAttribute('href')!.replace('/components/', '');
      const row = tile.parentElement!.parentElement!;
      const hasBadge = within(row).queryByText(DEPRECATED_LABEL) != null;
      expect(hasBadge, name).toBe(deprecatedNames.has(name));
      if (hasBadge) {
        labeled++;
      }
    }
    expect(labeled).toBeGreaterThan(0);
  });

  it("a current component's page shows no deprecation", () => {
    const {pkg, entry} = all.find(
      ({entry}) => !entry.deprecated && entry.props.length > 0,
    )!;
    render(
      <ComponentDetailClient
        comp={entry}
        pkg={pkg}
        pkgVersion="0.0.0"
        showcase={undefined}
      />,
    );
    expect(screen.queryByText(DEPRECATED_LABEL)).toBeNull();
    expect(screen.queryByText(/^Deprecated: use /)).toBeNull();
  });
});
