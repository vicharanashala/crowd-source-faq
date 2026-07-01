/**
 * BatchContext — DEPRECATED re-export shim around ProgramContext.
 *
 * v1.69 — Phase 12 file-rename. The canonical implementation
 * is now `ProgramContext.tsx` (which provides the new
 * `useProgram` / `currentProgram` / `availablePrograms` /
 * `ProgramProvider` exports along with the legacy aliases).
 * This file exists for backwards compat with the many
 * import sites that still do `from '../context/BatchContext'`
 * — they keep working unchanged.
 *
 * Migration path:
 *   - Update one import at a time as you touch the file
 *   - When v1.70 ships the cutover, delete this file
 *
 * Refs: context/multi-program-cms-design.md — phase 12
 * frontend refactor (context rename).
 */

export {
  ProgramProvider,
  BatchProvider,
  useProgram,
  useBatch,
  type Program,
  type Batch,
  default,
} from './ProgramContext';
