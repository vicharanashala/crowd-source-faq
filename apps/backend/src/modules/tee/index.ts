/**
 * Barrel for the Sign My Tee module. Internal callers import from
 * this file (e.g. for tests), external wiring goes through
 * `tee.routes.ts`.
 */
export { default as Tee } from './tee.model.js';
export { default as teeRoutes } from './tee.routes.js';
export * from './tee.controller.js';
export * from './tee.validation.js';
export * from './eligibility.js';
