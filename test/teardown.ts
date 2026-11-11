/**
 * @file Jest global teardown hook that runs once after the test suite finishes.
 */

/**
 * Releases the global Jest environment, which holds no external services to stop.
 * @returns A promise that resolves once teardown has finished.
 * @example
 * ```ts
 * import teardown from './test/teardown';
 *
 * await teardown();
 * ```
 */
export default async function teardown(): Promise<void> {
  // noinspection JSUnusedGlobalSymbols
  // No external services to tear down.
}
