/**
 * Unit tests for Akhand Paatth infinite scroll.
 *
 * Most suites cover the framework-free modules (the window model, the shabad
 * feed, scroll geometry, and the settings that drive layout), which carry the
 * invariants the feature depends on and are the parts a future change is most
 * likely to break silently. A few render real components, because some decisions
 * only exist as behaviour and asserting on the source text instead has already
 * let regressions through.
 *
 * Suites needing a DOM opt in per file with a `@jest-environment jsdom` docblock,
 * so the majority keep the faster and stricter node environment.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  clearMocks: true,
};
