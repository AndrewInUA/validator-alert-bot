/**
 * One full check inside this window.
 * Callers may poke the function every minute. Those extra calls must return
 * before any network reads. A full pass every minute uses the Hobby team's
 * shared Fluid CPU and can pause every project on the team.
 */
const PACE_KEY = "_pace";
const PACE_MS = 4 * 60 * 1000;

function dueForCheck(previous, now) {
  const ranAt = Date.parse(previous && previous.ranAt);
  if (!Number.isFinite(ranAt)) return true;
  return now - ranAt >= PACE_MS;
}

module.exports = {
  PACE_KEY,
  PACE_MS,
  dueForCheck
};
