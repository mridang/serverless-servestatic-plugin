/**
 * @file Jest global setup hook that runs once before the test suite starts.
 */

/**
 * Prepares the global Jest environment, which needs no external services.
 * @returns A promise that resolves once setup has finished.
 * @example
 * ```ts
 * import setup from './test/setup';
 *
 * await setup();
 * ```
 */
export default async function setup(): Promise<void> {
  // noinspection JSUnusedGlobalSymbols
  // No external services are required for the test suite.
}
