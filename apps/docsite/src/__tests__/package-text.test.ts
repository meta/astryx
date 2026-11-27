// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file package-text.test.ts
 * @input The generated package registry and package text, the changelog data,
 *   and the package page
 * @output Proof that the package registry holds no README or changelog text,
 *   and that the server modules that show the text read each package's own
 * @position Build-time docsite data verification. The build's
 *   check-server-text-bundle.mjs proves that no browser script holds the text.
 * Run: pnpm -F @astryxdesign/docsite test
 */

import {describe, expect, it, vi} from 'vitest';
import DocPage from '../app/(docs)/docs/[topic]/page';
import {RELEASE_HEADING} from '../components/changelogLinkify';
import {packages} from '../generated/packageRegistry';
import {changelogEntries} from '../lib/changelogData';
import {packageText} from '../lib/packageText';

// The page's views use StyleX, which this suite does not compile. The test
// reads the props that the page gives its view.
vi.mock('../components/docs/PackageStubPage', () => ({
  PackageStubPage: () => null,
}));
vi.mock('../components/docs/ReferenceDocView', () => ({
  ReferenceDocView: () => null,
}));
vi.mock('../components/docs/TokensDocView', () => ({
  TokensDocView: () => null,
}));

function releaseHeadings(text: string | null): number {
  return (text ?? '').split('\n').filter(line => RELEASE_HEADING.test(line))
    .length;
}

describe('package text', () => {
  it('is not in the package registry, which client modules import', () => {
    for (const pkg of packages) {
      expect(pkg).not.toHaveProperty('readme');
      expect(pkg).not.toHaveProperty('changelog');
    }
  });

  it('lists the packages of the registry, in its order', () => {
    expect(packageText.map(text => text.name)).toEqual(
      packages.map(pkg => pkg.name),
    );
  });

  it('holds the README of each package that has one', () => {
    for (const pkg of packages) {
      const {readme} = packageText.find(text => text.name === pkg.name)!;
      if (pkg.hasReadme) {
        expect(readme!.length).toBeGreaterThan(50);
      } else {
        expect(readme).toBeNull();
      }
    }
    const cli = packageText.find(text => text.name === '@astryxdesign/cli')!;
    expect(cli.readme!.length).toBeGreaterThan(1000);
  });

  it('holds the changelog of each package that has one', () => {
    for (const pkg of packages) {
      const {changelog} = packageText.find(text => text.name === pkg.name)!;
      if (pkg.hasChangelog) {
        expect(changelog!.length).toBeGreaterThan(
          pkg.name === '@astryxdesign/richtext' ? 0 : 50,
        );
      } else {
        expect(changelog).toBeNull();
      }
    }
  });

  it('keeps a README and a changelog apart', () => {
    const core = packageText.find(text => text.name === '@astryxdesign/core')!;
    expect(releaseHeadings(core.readme)).toBe(0);
    expect(releaseHeadings(core.changelog)).toBeGreaterThan(0);
  });

  it('gives the changelog routes the changelog of each package that has one', () => {
    const withChangelog = packages.filter(pkg => pkg.hasChangelog);
    expect(withChangelog.length).toBeGreaterThan(1);
    expect(changelogEntries.map(entry => entry.pkg)).toEqual(
      withChangelog.map(pkg => pkg.name),
    );
    for (const entry of changelogEntries) {
      expect(entry.content).toBe(
        packageText.find(text => text.name === entry.pkg)!.changelog,
      );
    }
  });

  it('gives a package page the README of its own package', async () => {
    for (const slug of ['core', 'cli']) {
      const page = await DocPage({params: Promise.resolve({topic: slug})});
      const {readme} = packageText.find(
        text => text.name === `@astryxdesign/${slug}`,
      )!;
      expect(readme).toContain(`# @astryxdesign/${slug}`);
      expect(page.props.name).toBe(`@astryxdesign/${slug}`);
      expect(page.props.readme).toBe(readme);
    }
  });
});
