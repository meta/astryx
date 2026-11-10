// The icon-set integration is installed, but the project selects no set.
import {writeIcons} from './icons.mjs';

export default async function (dir, h) {
  await writeIcons(dir, h, {integrations: ['@acme/glyphs']});
}
