// npm run lint: every .mjs file must parse, and every dependency must be pinned to an
// exact version (docs/method.md section 10: the toolchain is held fixed).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DIRS = ['app', 'harness', 'test', 'scripts'];
const files = DIRS.filter((d) => fs.existsSync(d))
  .flatMap((d) => fs.readdirSync(d, { recursive: true }).map((f) => path.join(d, f)))
  .filter((f) => f.endsWith('.mjs') || f.endsWith('.js'));

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    failed += 1;
    console.error(`${f}: ${e.stderr.toString().trim()}`);
  }
}

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    failed += 1;
    console.error(`package.json: ${name} is "${version}", not an exact version`);
  }
}

console.log(`${files.length} files checked, ${failed} problem(s)`);
process.exit(failed ? 1 : 0);
