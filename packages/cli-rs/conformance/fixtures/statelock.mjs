// The per-user state lock (`~/.config/astryx/.lock-state`) as other runs can
// leave it: one app per subfolder, each with its own config folder (`xdg/`,
// passed as XDG_CONFIG_HOME). Lock times are set relative to the suite's
// pinned clock, 2026-11-10T00:00:00Z.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const NOW = Date.UTC(2026, 10, 10) / 1000;

export default async function (dir, h) {
  const lock = async (name, {age = 0, owner, file = false, state} = {}) => {
    const d = path.join(dir, name);
    await h.makeApp(d, {name});
    const cfg = path.join(d, 'xdg', 'astryx');
    fs.mkdirSync(cfg, {recursive: true});
    if (state) h.writeJson(path.join(cfg, 'state.json'), state);
    const lockPath = path.join(cfg, '.lock-state');
    if (file) fs.writeFileSync(lockPath, 'not a folder\n');
    else {
      fs.mkdirSync(lockPath);
      if (owner) fs.writeFileSync(path.join(lockPath, 'owner.json'), JSON.stringify(owner));
    }
    fs.utimesSync(lockPath, NOW - age, NOW - age);
  };
  // In the suite's overlay a lock folder from the fixture cannot be renamed
  // aside (EXDEV), and the pinned clock never reaches the wait's deadline: a
  // folder lock, stale or not, holds the run until the case times out. A lock
  // left as a plain file is taken over.
  const here = os.hostname();
  await lock('unowned-old', {age: 60});
  await lock('unowned-fresh', {age: 5});
  await lock('live-local', {age: 5, owner: {pid: 1, host: here, at: 0}});
  await lock('lock-is-file', {age: 60, file: true});
  await lock('with-state', {age: 60, file: true, state: {notifiedAt: {'setup:/elsewhere': Date.UTC(2026, 10, 9), 'setup:/forgotten': Date.UTC(2026, 8, 1)}, latest: '9.9.9'}});
}
