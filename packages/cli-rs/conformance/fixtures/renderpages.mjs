// Pages to render outside any project (the CLI's own package set serves
// React and Core): local modules, stylesheets, images, JSON, console output,
// and pages that fail in each way a render reports.
import * as path from 'node:path';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

export default function make(dir, {writeFile}) {
  const w = (rel, text) => writeFile(path.join(dir, rel), text);
  w('basic.tsx', "import {Button} from '@astryxdesign/core';\n\nexport default function Page() {\n  return <Button label=\"Go\" />;\n}\n");
  w('heading.tsx', "import {Button, Text} from '@astryxdesign/core';\n\nexport default function Page() {\n  return (\n    <main>\n      <h1>Quarterly &amp; <em>report</em></h1>\n      <Text>Numbers went up.</Text>\n      <Button label=\"Download\" />\n    </main>\n  );\n}\n");
  w('local.tsx', "import {Card} from './components/Card';\nimport data from './data.json';\n\nexport default function Page() {\n  return <div>{data.items.map(i => <Card key={i} title={i} />)}</div>;\n}\n");
  w('components/Card.tsx', "import {Text} from '@astryxdesign/core';\n\nexport function Card({title}: {title: string}) {\n  return <section><Text>{title}</Text></section>;\n}\n");
  w('data.json', JSON.stringify({items: ['One', 'Two']}) + '\n');
  w('styled.tsx', "import './styles.css';\n\nexport default function Page() {\n  return <div className=\"hero\"><p className=\"lead\">Hello</p></div>;\n}\n");
  w('styles.css', "/* page styles */\n.hero { padding: 8px; background: url(./logo.png); }\n.unused { color: red; }\n@media (min-width: 600px) {\n  .lead { font-size: 20px; }\n  .gone { color: blue; }\n}\n");
  writeFile(path.join(dir, 'logo.png'), PNG);
  w('image.tsx', "import logo from './logo.png';\n\nexport default function Page() {\n  return <figure><img src={logo} alt=\"Logo\" /><img src=\"./logo.png\" alt=\"Again\" /><img src=\"https://example.com/x.png\" alt=\"Remote\" /></figure>;\n}\n");
  w('logs.tsx', "export default function Page() {\n  console.log('rendering', {a: 1});\n  console.warn('careful');\n  return <p>Logged</p>;\n}\n");
  w('nodefault.tsx', "export function Page() {\n  return <p>x</p>;\n}\n");
  w('syntax.tsx', "export default function Page() {\n  return <p>unclosed;\n}\n");
  w('browser.tsx', "export default function Page() {\n  return <p>{window.innerWidth}</p>;\n}\n");
  w('throws.tsx', "export default function Page() {\n  throw new Error('boom here');\n}\n");
  w('missing.tsx', "import {Thing} from 'no-such-package';\n\nexport default function Page() {\n  return <Thing />;\n}\n");
  w('missinglocal.tsx', "import {Thing} from './nope';\n\nexport default function Page() {\n  return <Thing />;\n}\n");
  w('dropped.tsx', "import {Button, Text} from '@astryxdesign/core';\n\nexport default function Page() {\n  return (\n    <div>\n      <Text>Shown text here</Text>\n      <Button>Click me please</Button>\n    </div>\n  );\n}\n");
  w('script.tsx', "export default function Page() {\n  return <div><script>{'alert(1)'}</script><iframe src=\"https://example.com\" /></div>;\n}\n");
  w('sass.tsx', "import './theme.scss';\n\nexport default function Page() {\n  return <p>Sass</p>;\n}\n");
  w('theme.scss', '$x: 1;\n');
  w('page.html', '<html><body><p>plain html, not astryx</p></body></html>\n');
  w('notes.txt', 'hello\n');
}
