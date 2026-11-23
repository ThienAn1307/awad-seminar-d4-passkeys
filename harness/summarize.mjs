// Turns raw session rows into the metrics of docs/method.md sections 6 and 9.
// Pure functions: no file or browser access, so they are unit-tested directly.

const HEADLINE_COHORT = 'stale';
const HEADLINE_FROM_SESSION = 2; // session 1 is the same in both arms by design

const pct = (part, whole) => (whole === 0 ? null : (100 * part) / whole);
const mean = (xs) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

export function spread(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { median, min: sorted[0], max: sorted[n - 1], n, identical: sorted[0] === sorted[n - 1] };
}

function aggregate(rows) {
  return {
    firstTryPct: pct(rows.filter((r) => r.firstTry).length, rows.length),
    actionsPerSignin: mean(rows.map((r) => r.actions)),
    keystrokesPerSignin: mean(rows.map((r) => r.keystrokes)),
    successPct: pct(rows.filter((r) => r.success).length, rows.length),
    signins: rows.length,
  };
}

// Metrics of one run of one arm.
export function runMetrics(rows) {
  const bySession = {};
  const successPctByCohort = {};
  for (const cohort of new Set(rows.map((r) => r.cohort))) {
    const own = rows.filter((r) => r.cohort === cohort);
    successPctByCohort[cohort] = aggregate(own).successPct;
    bySession[cohort] = {};
    for (const session of new Set(own.map((r) => r.session))) {
      bySession[cohort][session] = aggregate(own.filter((r) => r.session === session));
    }
  }
  const h = aggregate(rows.filter((r) => r.cohort === HEADLINE_COHORT && r.session >= HEADLINE_FROM_SESSION));
  return {
    headline: { firstTryPct: h.firstTryPct, actionsPerSignin: h.actionsPerSignin, signins: h.signins },
    bySession,
    successPctByCohort,
  };
}

// Probe metrics for one run of one variant (method.md section 8). Session 1 is when the
// accepted-credentials signal first fires; its effect shows from session 2 on.
export function probeMetrics(rows) {
  const users = [...new Set(rows.map((r) => r.user))];
  const firstSession = rows.filter((r) => r.session === 1);
  const later = rows.filter((r) => r.session >= HEADLINE_FROM_SESSION);
  const lockedOut = users.filter((u) => later.some((r) => r.user === u && !r.success));
  const h = aggregate(later);
  return {
    passkeyDeletedPct: pct(firstSession.filter((r) => !r.passkeyKept).length, firstSession.length),
    lockoutPct: pct(lockedOut.length, users.length),
    firstTryPct: h.firstTryPct,
    actionsPerSignin: h.actionsPerSignin,
    users: users.length,
  };
}

// runs: [{ run, arm, status: 'ok' | 'error', rows }]. Error runs keep their logs on disk
// but stay out of the median.
export function summarize(runs, { minRuns = 5 } = {}) {
  const arms = {};
  for (const arm of new Set(runs.map((r) => r.arm))) {
    const mine = runs.filter((r) => r.arm === arm);
    const ok = mine.filter((r) => r.status === 'ok');
    const perRun = ok.map((r) => ({ run: r.run, ...runMetrics(r.rows) }));
    arms[arm] = {
      validRuns: ok.length,
      errorRuns: mine.length - ok.length,
      headline: perRun.length === 0 ? null : {
        firstTryPct: spread(perRun.map((m) => m.headline.firstTryPct)),
        actionsPerSignin: spread(perRun.map((m) => m.headline.actionsPerSignin)),
      },
      perRun,
    };
  }
  const enoughRuns = Object.values(arms).every((a) => a.validRuns >= minRuns);
  return { enoughRuns, minRuns, arms };
}
