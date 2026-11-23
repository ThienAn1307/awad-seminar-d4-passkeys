// Reads the newest out/results-*.json and prints, per test variant and config, a
// fingerprint of the outcome with volatile fields removed, flagging run-to-run differences.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const NO_MS = process.argv.includes('--no-ms');
const argFile = process.argv.slice(2).find(a => !a.startsWith('--'));
const file = argFile || path.join(OUT, fs.readdirSync(OUT).filter(f => /^results-.*\.json$/.test(f)).sort().pop());
const { meta, results } = JSON.parse(fs.readFileSync(file, 'utf8'));

const VOLATILE = new Set(['id', 'credId', 'staleId', 'credentialId', 'challenge', 'origin', 't', 'userHandle', 'returnedId', 'rawCreate', 'rawGet', 'rawPair', 'url', 'credsBefore', 'credsAfter', 'trials', 'exe']);
const bucket = ms => (typeof ms !== 'number' ? ms : ms < 100 ? '<100ms' : ms < 1000 ? '<1s' : `~${Math.round(ms / 1000)}s`);
function strip(v, k) {
  if (Array.isArray(v)) return v.map(x => strip(x));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [kk, vv] of Object.entries(v)) {
      if (VOLATILE.has(kk)) continue;
      if (kk === 'credsOnAuthenticator' && Array.isArray(vv)) { o[kk] = `${vv.length} cred(s)` + (vv[0] ? ` BE=${vv[0].BE} BS=${vv[0].BS} rk=${vv[0].rk}` : ''); continue; }
      if (kk === 'clientData') { o[kk] = { type: vv.type }; continue; }
      if (NO_MS && (kk === 'ms' || /Ms(_driver)?$/.test(kk))) continue;
      o[kk] = kk === 'ms' && typeof vv === 'number' ? bucket(vv) : strip(vv, kk);
    }
    return o;
  }
  if (typeof v === 'string') return v.replace(/pending after [\d.]+ s/, 'pending (timed out by harness)').replace(/localhost:\d+/g, 'localhost:PORT');
  return v;
}

console.log('# results file:', file);
console.log('# meta:', JSON.stringify(meta));
const groups = new Map();
for (const r of results) {
  if (r.test === 'P') continue;
  const key = `${r.test} | ${r.variant}`;
  if (!groups.has(key)) groups.set(key, new Map());
  const g = groups.get(key);
  if (!g.has(r.config)) g.set(r.config, []);
  const { config, run, test, variant, ...rest } = r;
  g.get(r.config).push({ run, fp: JSON.stringify(strip(rest)) });
}
for (const [key, g] of groups) {
  console.log('\n## ' + key);
  for (const [cfg, runs] of g) {
    const same = runs.every(x => x.fp === runs[0].fp);
    if (same) console.log(`  [${cfg}] runs ${runs.map(x => x.run).join(',')} IDENTICAL: ${runs[0].fp}`);
    else for (const x of runs) console.log(`  [${cfg}] r${x.run} DIFFERS: ${x.fp}`);
  }
}
