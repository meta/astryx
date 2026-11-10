// A project whose config and integrations ship gap-report handlers: a
// project handler that acts on the component name, a public integration
// handler with its own issues URL, and an integration whose handler export
// is malformed.
import * as path from 'node:path';
import * as fs from 'node:fs';

export default function make(dir, {makeApp, writeFile, writeJson}) {
  makeApp(dir, {name: 'gapreport-app'});
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  pj.dependencies['@acme/hooks'] = '2.0.0';
  pj.dependencies['@acme/broken'] = '0.1.0';
  writeJson(path.join(dir, 'package.json'), pj);
  writeFile(path.join(dir, 'astryx.config.mjs'), "export default {\n  gapReport: {\n    audience: 'internal',\n    async handle(report, {signal}) {\n      switch (report.component) {\n        case 'Throw': throw new Error('project handler broke');\n        case 'Exit': process.exit(3);\n        case 'Code': process.exitCode = 2; return {status: 'filed', message: 'x'};\n        case 'Bad': return {status: 'filed', extra: 1};\n        case 'Skip': return {status: 'skipped'};\n        case 'Route': return {status: 'routed_only', url: 'https://example.com/r'};\n        case 'Log': console.log('logged', report.category, report.intention, report.detail ?? '-'); return {status: 'filed', url: 'https://example.com/1'};\n        case 'Never': return new Promise(() => {});\n        default: return {status: 'filed', url: 'https://example.com/issues/1', message: `filed ${report.component} ${report.categoryLabel} ${report.target.package}`};\n      }\n    },\n  },\n};\n");
  const hooks = path.join(dir, 'node_modules/@acme/hooks');
  writeJson(path.join(hooks, 'package.json'), {name: '@acme/hooks', version: '2.0.0'});
  writeFile(path.join(hooks, 'astryx.integration.mjs'), "export default {components: './components', issuesUrl: 'https://example.com/hooks/issues'};\nexport const gapReport = {\n  audience: 'public',\n  handle(report) {\n    if (report.component === 'PublicThrow') throw 'plain string';\n    return {status: 'filed', url: 'https://example.com/hooks/1'};\n  },\n};\n");
  writeFile(path.join(hooks, 'components/HookCard.doc.mjs'), "/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */\nexport default {type: 'component', name: 'HookCard', displayName: 'HookCard', description: 'A card.', category: 'Layout', props: []};\n");
  writeFile(path.join(hooks, 'components/HookCard.tsx'), 'export function HookCard() { return null; }\n');
  const broken = path.join(dir, 'node_modules/@acme/broken');
  writeJson(path.join(broken, 'package.json'), {name: '@acme/broken', version: '0.1.0'});
  writeFile(path.join(broken, 'astryx.integration.mjs'), "export default {issuesUrl: 'https://github.com/acme/broken/issues'};\nexport const gapReport = {audience: 'everyone', handle: 1};\n");
}
