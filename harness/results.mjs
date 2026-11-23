// Where raw logs go, and the environment record that proves what was held fixed.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

export function newResultsDir(...parts) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join('results', ...parts, stamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function environment(extra = {}) {
  return {
    startedAt: new Date().toISOString(),
    node: process.version,
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model ?? null,
    commit: git('rev-parse HEAD'),
    dirtyWorkingTree: git('status --porcelain') !== '',
    ci: process.env.CI === 'true',
    ...extra,
  };
}

export function writeJson(dir, name, value) {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n');
}

export function appendJsonl(dir, name, value) {
  fs.appendFileSync(path.join(dir, name), JSON.stringify(value) + '\n');
}
