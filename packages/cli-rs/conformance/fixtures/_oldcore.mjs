// An app with an older published @astryxdesign/core, installed from its npm
// tarball (cached under /tmp/astryx-conformance/npm-cache; downloaded once with
// npm when missing, using the environment's proxy settings if any).
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CACHE = '/tmp/astryx-conformance/npm-cache';

function tarball(version) {
  const file = path.join(CACHE, `astryxdesign-core-${version}.tgz`);
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(CACHE, {recursive: true});
  const r = spawnSync('npm', ['pack', `@astryxdesign/core@${version}`, '--silent', '--pack-destination', CACHE], {
    encoding: 'utf8',
  });
  if (r.status !== 0 || !fs.existsSync(file)) throw new Error(`could not download @astryxdesign/core@${version}: ${r.stderr}`);
  return file;
}

export function makeOldCoreApp(dir, h, version) {
  const core = path.join(dir, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(core, {recursive: true});
  const r = spawnSync('tar', ['-xzf', tarball(version), '-C', core, '--strip-components=1'], {encoding: 'utf8'});
  if (r.status !== 0) throw new Error(`could not unpack core ${version}: ${r.stderr}`);
  h.installDeps(h.PKG('core'), path.join(dir, 'node_modules'), ['intl-messageformat', 'react', 'react-dom', '@stylexjs/stylex']);
  h.writeJson(path.join(dir, 'package.json'), {
    name: `app-core-${version}`,
    version: '1.0.0',
    private: true,
    dependencies: {'@astryxdesign/core': version, react: '^19.0.0', 'react-dom': '^19.0.0', '@stylexjs/stylex': '^0.19.0'},
  });
  // Code written against older APIs, from several eras, so codemods change it.
  h.writeFile(path.join(dir, 'src/LegacyXds.tsx'), `import {XDSBadge, XDSBanner, XDSButton, XDSDialog, XDSSelector, XDSTopNav} from '@xds/core';

export function LegacyXds({open}: {open: boolean}) {
  return (
    <>
      <XDSTopNav title="Home" />
      <XDSBanner status="info" title="Heads up" endButton={<XDSButton label="Ok" />} />
      <XDSSelector label="Fruit" items={[{value: 'a', label: 'Apple'}]} />
      <XDSDialog isShown={open} onHide={() => {}} title="Hello" />
      <XDSButton label="Next" endSlot={<XDSBadge dot />} />
    </>
  );
}
`);
  h.writeFile(path.join(dir, 'src/Legacy.tsx'), `import {Avatar, Banner, CodeBlock, Dialog, Grid, List, Selector, Switch, TabList, Text} from '@astryxdesign/core';

export function Legacy({open}: {open: boolean}) {
  return (
    <>
      <Text color="active">Hi</Text>
      <Switch label="On" labelSpacing="default" />
      <Avatar name="Ada" size="small" />
      <TabList orientation="horizontal" />
      <Dialog isOpen={open} position="left" title="Side" />
      <Grid minChildWidth={200} />
      <Banner status="info" title="More" defaultIsExpanded />
      <Selector label="Pick" options={[]} emptySearchResultsText="None" />
      <List edgeCompensation />
      <CodeBlock code="x" tokenizer={(s: string) => [s]} />
    </>
  );
}
`);
  h.writeFile(path.join(dir, 'src/theme.css'), '.xds-button.primary { color: red; }\n.astryx-button.primary { color: blue; }\n');
  h.writeFile(path.join(dir, 'src/App.tsx'), "import {Button} from '@astryxdesign/core';\n\nexport default function App() {\n  return <Button label=\"Hi\" />;\n}\n");
}
