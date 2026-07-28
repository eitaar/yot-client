/* eslint-env node */

/**
 * Pin the suite's time zone *before* any worker forks, and therefore before any
 * `Date` in test code observes a zone. Node reads `TZ` once, at first date use,
 * so setting it here — in globalSetup, which runs in the parent process ahead of
 * the worker pool — is the only place it reliably takes effect everywhere.
 *
 * UTC is the default so `npx jest` is deterministic on any machine. An
 * explicitly exported `TZ` is honoured, which is deliberate: `TZ=Asia/Tokyo npx
 * jest` has to genuinely re-run the suite in Tokyo, otherwise the TZ-coupled
 * fixtures this pin was added for could rot again without anyone noticing.
 */
module.exports = async () => {
  process.env.TZ = process.env.TZ || 'UTC';
};
