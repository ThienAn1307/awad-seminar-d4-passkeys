// A B B A A B B A ...: neither arm always runs first, so drift over time (a warming disk,
// a background task) cannot favour one arm (docs/method.md section 9).
export function abbaOrder(runsPerArm) {
  return Array.from({ length: runsPerArm * 2 }, (_, i) => ((((i + 1) >> 1) % 2) === 0 ? 'baseline' : 'change'));
}
