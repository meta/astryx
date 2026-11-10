// Legacy source written with awkward formatting: CRLF line endings, tabs, a
// byte-order mark, non-ASCII text and comments in every position.
import * as path from 'node:path';

export default function (dir, {makeApp, writeFile}) {
  makeApp(dir, {name: 'format-app'});
  const w = (rel, text) => writeFile(path.join(dir, rel), text);
  w('src/crlf.tsx', "import {XDSDialog, XDSSelector} from '@xds/core';\r\n\r\nexport function A({open}: {open: boolean}) {\r\n  return (\r\n    <XDSDialog isShown={open} title=\"Héllo 👋\">\r\n      <XDSSelector items={['a', 'b']} /* keep */ />\r\n    </XDSDialog>\r\n  );\r\n}\r\n");
  w('src/tabs.jsx', "import {XDSStack, XDSBanner} from '@xds/core';\n\nexport function B() {\n\treturn (\n\t\t<XDSStack gap=\"space2\">\n\t\t\t<XDSBanner\n\t\t\t\tvariant=\"card\"\n\t\t\t\tendButton={<span>✕</span>}\n\t\t\t/>\n\t\t</XDSStack>\n\t);\n}\n");
  w('src/bom.ts', "\uFEFFimport {useXDSIcon} from '@xds/core/IconRegistry';\n\n// 日本語のコメント\nexport const icon = () => useXDSIcon('close');\n");
  w('src/mixed.tsx', "// leading comment\nimport {\n  XDSBadge, // trailing\n  XDSText,\n} from '@xds/core';\n\n/** doc */\nexport const C = () => (\n  <>\n    {/* a */}\n    <XDSBadge shape=\"dot\" variant=\"success\" />\n    <XDSText color=\"active\">&nbsp;Ünïcödé — “quotes” {'{'}</XDSText>\n  </>\n);\n");
  w('src/noeol.tsx', "import {XDSSelector} from '@xds/core';\nexport const D = () => <XDSSelector items={[]} />");
}
