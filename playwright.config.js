/**
 * PLAYWRIGHT CONFIGURATION FOR BUBBLEVOICE MAC
 *
 * This configuration file sets up Playwright for testing the Electron application.
 * Unlike browser-based Playwright testing, Electron testing requires special handling
 * because we're testing a desktop application, not a web page.
 *
 * TECHNICAL NOTES:
 * - We use Playwright's _electron module to launch and control the Electron app
 * - Tests run sequentially (fullyParallel: false) because Electron apps can't run
 *   multiple instances simultaneously without port conflicts
 * - Workers set to 1 for the same reason - only one Electron instance at a time
 * - Longer timeouts (30s) because Electron app startup includes backend server init
 *
 * ARCHITECTURE DECISION:
 * We chose Playwright over Spectron (deprecated) because:
 * 1. Playwright is actively maintained and has excellent TypeScript support
 * 2. Better debugging tools (UI mode, trace viewer)
 * 3. More reliable waiting mechanisms
 * 4. Cross-platform support (though we only need macOS for now)
 *
 * PRODUCT CONTEXT:
 * These tests verify that BubbleVoice's UI behaves correctly. Critical paths include:
 * - App launches and shows the main window
 * - Settings panel opens and closes
 * - Voice activation UI responds correctly
 * - Conversation flow works end-to-end
 *
 * HISTORY:
 * - 2026-01-21: Initial setup for Electron testing
 */

// @ts-check
const { defineConfig } = require('@playwright/test');

/**
 * Playwright configuration object
 *
 * IMPORTANT: For Electron testing, we don't use the standard "projects" array
 * with browser configurations. Instead, tests import the Electron helper directly
 * and launch the app themselves. This config only sets global options.
 */
module.exports = defineConfig({
  /**
   * TEST DIRECTORY
   *
   * All Playwright tests live in tests/playwright/ to keep them separate from
   * existing unit tests and integration tests. This also makes it easy to run
   * different test suites independently.
   */
  testDir: './tests/playwright',

  /**
   * TEST TIMEOUT
   *
   * 30 seconds per test is generous but necessary because:
   * 1. Electron app startup takes 2-5 seconds (creates window, starts backend)
   * 2. Backend server initialization adds another 2-3 seconds
   * 3. Some tests need to wait for network responses or animations
   *
   * Individual tests can override this with test.setTimeout() if needed.
   */
  timeout: 30000,

  /**
   * EXPECT TIMEOUT
   *
   * How long assertions like expect(locator).toBeVisible() wait before failing.
   * 5 seconds is enough for most UI updates to complete.
   */
  expect: {
    timeout: 5000
  },

  /**
   * PARALLELIZATION SETTINGS
   *
   * CRITICAL: Electron tests MUST run sequentially because:
   * 1. Each test launches a full Electron app instance
   * 2. Backend server uses fixed ports (7482, 7483) - can't have multiple
   * 3. System resources (microphone, global shortcuts) can't be shared
   *
   * fullyParallel: false - tests in a file run sequentially
   * workers: 1 - only one test file runs at a time
   */
  fullyParallel: false,
  workers: 1,

  /**
   * FORBID ONLY
   *
   * In CI environments, fail if test.only() is accidentally committed.
   * This prevents accidentally skipping tests in production builds.
   */
  forbidOnly: !!process.env.CI,

  /**
   * RETRY CONFIGURATION
   *
   * Retry failed tests:
   * - 0 times in CI (fast feedback, tests should be reliable)
   * - 0 times locally (see failures immediately during development)
   *
   * We could bump retries to 1-2 if we encounter flaky tests, but it's better
   * to fix the flakiness than hide it with retries.
   */
  retries: process.env.CI ? 0 : 0,

  /**
   * REPORTER CONFIGURATION
   *
   * Multiple reporters for different use cases:
   * - list: Console output during test runs (human-readable)
   * - json: Machine-readable results for CI/CD pipelines
   * - html: Rich interactive report with screenshots and traces
   *
   * HTML report is especially useful for debugging failed tests because it
   * includes screenshots, videos, and step-by-step traces.
   */
  reporter: [
    ['list'],
    ['json', { outputFile: 'tests/playwright-report/results.json' }],
    ['html', { outputFolder: 'tests/playwright-report' }]
  ],

  /**
   * OUTPUT DIRECTORY
   *
   * Where test artifacts (screenshots, videos, traces) are stored.
   * Keeping this inside tests/ keeps the project root clean.
   */
  outputDir: 'tests/playwright-results',

  /**
   * USE OPTIONS (DEFAULTS FOR ALL TESTS)
   *
   * These options apply to all tests but can be overridden per-test or per-file.
   * Note: For Electron testing, most browser-specific options don't apply.
   * We mainly use trace, screenshot, and video settings.
   */
  use: {
    /**
     * TRACE COLLECTION
     *
     * 'on-first-retry' means traces are only collected when a test fails and
     * is retried. This saves disk space while still providing debugging info.
     *
     * Traces include:
     * - DOM snapshots at each step
     * - Network requests
     * - Console logs
     * - Action timeline
     */
    trace: 'on-first-retry',

    /**
     * SCREENSHOT SETTINGS
     *
     * 'only-on-failure' means screenshots are taken when tests fail.
     * This provides visual debugging without cluttering results with
     * screenshots from passing tests.
     */
    screenshot: 'only-on-failure',

    /**
     * VIDEO RECORDING
     *
     * 'retain-on-failure' records videos for all tests but only keeps them
     * for failed tests. This is great for debugging UI issues but doesn't
     * waste disk space on successful runs.
     *
     * Videos are especially helpful for timing/animation issues that are
     * hard to debug from static screenshots.
     */
    video: 'retain-on-failure',

    /**
     * ACTION TIMEOUT
     *
     * How long individual actions (click, fill, etc.) wait before timing out.
     * 10 seconds is enough for most UI interactions even on slow machines.
     */
    actionTimeout: 10000,

    /**
     * NAVIGATION TIMEOUT
     *
     * How long page navigations wait. Not directly used in Electron testing
     * since we load local files, but good to have as a safety net.
     */
    navigationTimeout: 15000,
  },

  /**
   * GLOBAL SETUP AND TEARDOWN
   *
   * Could be used to:
   * - Set up test database
   * - Clean up from previous runs
   * - Verify system requirements
   *
   * Currently not needed but placeholders are here for future use.
   */
  // globalSetup: './tests/playwright/global-setup.js',
  // globalTeardown: './tests/playwright/global-teardown.js',
});

/**
 * USAGE NOTES:
 *
 * Run all Playwright tests:
 *   npm run test:playwright
 *
 * Run tests with visible browser (headed mode):
 *   npm run test:playwright:headed
 *
 * Debug tests with Playwright Inspector:
 *   npm run test:playwright:debug
 *
 * Open interactive UI mode:
 *   npm run test:playwright:ui
 *
 * View the HTML report:
 *   npm run test:playwright:report
 */
