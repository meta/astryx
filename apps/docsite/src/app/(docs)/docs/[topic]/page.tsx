// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Unified docs-section template. Serves two kinds of slug:
 * - long-form-doc: guide/foundation topics from docsRegistry, rendered via
 *   ContentBlockRenderer (TokensDocView for live token tables, otherwise
 *   ReferenceDocView).
 * - package: non-theme @astryxdesign packages (e.g. @astryxdesign/core, @astryxdesign/cli), rendered as
 *   a README stub via PackageStubPage with install steps and an optional CTA.
 * Theme packages are NOT served here — they live at /themes/<name>.
 */

import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {docTopics} from '../../../../generated/docsRegistry';
import {
  packages,
  type PackageMeta,
} from '../../../../generated/packageRegistry';
import {components} from '../../../../generated/componentRegistry';
import {ReferenceDocView} from '../../../../components/docs/ReferenceDocView';
import {TokensDocView} from '../../../../components/docs/TokensDocView';
import {PackageStubPage} from '../../../../components/docs/PackageStubPage';
import {type InstallStep} from '../../../../components/docs/PackageActions';
import {linkifyDocSections} from '../../../../components/docs/docsLinkify';
import {pageMetadata} from '../../../../lib/pageMetadata';

// Every documented component and hook name, for the prose auto-linker. Same
// list the changelog passes to linkifyComponents.
const componentNames = Object.values(components)
  .flat()
  .map(c => c.name);

const TOKEN_TOPICS = new Set([
  'tokens',
  'color',
  'elevation',
  'motion',
  'shape',
  'spacing',
  'typography',
]);

function slugToPackageName(slug: string): string {
  return `@astryxdesign/${slug}`;
}

function isThemePackage(name: string): boolean {
  return name.includes('theme-');
}

function getInstallSteps(pkg: PackageMeta): InstallStep[] {
  const installTarget = pkg.canaryOnly ? `${pkg.name}@canary` : pkg.name;
  if (pkg.name.endsWith('/cli')) {
    return [
      {label: 'Install the CLI', code: `npm install -D ${installTarget}`},
      {label: 'Run a command', code: `npx @astryxdesign/cli component --list`},
    ];
  }
  return [
    {label: 'Install the package', code: `npm install ${installTarget}`},
    {
      label: 'Import a component',
      code: `import {...} from '${pkg.name}/ComponentName';`,
      language: 'typescript',
    },
  ];
}

/** Sections to remove from the @astryxdesign/core README on the package page. */
const CORE_STRIP_SECTIONS = ['Quick Start', 'Resources', 'Astryx CLI'];

export function generateStaticParams() {
  return [
    ...docTopics.map(d => ({topic: d.topic})),
    ...packages
      .filter(p => !isThemePackage(p.name))
      .map(p => ({topic: p.name.replace('@astryxdesign/', '')})),
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{topic: string}>;
}): Promise<Metadata> {
  const {topic: slug} = await params;

  // Mirror the page's own slug resolution: long-form doc topic first, then a
  // non-theme package reference page.
  const topic = docTopics.find(d => d.topic === slug);
  if (topic) {
    return pageMetadata({
      title: topic.title,
      description:
        topic.description ||
        `${topic.title} documentation for the Astryx design system.`,
      path: `/docs/${slug}`,
      type: 'article',
    });
  }

  const pkg = packages.find(
    p => p.name === slugToPackageName(slug) && !isThemePackage(p.name),
  );
  if (pkg) {
    return pageMetadata({
      title: pkg.displayName,
      description:
        pkg.description ||
        `The ${pkg.name} package for the Astryx design system.`,
      path: `/docs/${slug}`,
      type: 'article',
    });
  }

  return {};
}

export default async function DocPage({
  params,
}: {
  params: Promise<{topic: string}>;
}) {
  const {topic: slug} = await params;

  const topic = docTopics.find(d => d.topic === slug);
  if (topic) {
    const isTokenTopic =
      topic.category === 'foundations' && TOKEN_TOPICS.has(topic.topic);
    const sections = linkifyDocSections(topic.sections, componentNames);

    return isTokenTopic ? (
      <TokensDocView
        title={topic.title}
        description={topic.description}
        sections={sections}
        topic={topic.topic}
      />
    ) : (
      <ReferenceDocView
        title={topic.title}
        description={topic.description}
        sections={sections}
      />
    );
  }

  const pkgName = slugToPackageName(slug);
  const pkg = packages.find(p => p.name === pkgName && !isThemePackage(p.name));
  if (!pkg) {
    notFound();
  }

  const isCorePackage = pkg.name === '@astryxdesign/core';
  const firstComponent = components[pkg.name]?.find(comp => !comp.hidden);

  return (
    <PackageStubPage
      name={pkg.name}
      description={pkg.description}
      version={pkg.version}
      readme={pkg.readme}
      installSteps={getInstallSteps(pkg)}
      cta={
        firstComponent
          ? {
              label: 'View Components',
              href: `/components/${firstComponent.name}`,
            }
          : undefined
      }
      stripSections={isCorePackage ? CORE_STRIP_SECTIONS : undefined}
      stripIntro={isCorePackage}
    />
  );
}
