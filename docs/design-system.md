# Design system convention

shamagama frontend has **two coexisting design-system layers**. This document codifies the convention so future contributions don't accidentally collide them.

## Layers

### Layer 1: In-house (PascalCase files in `src/components/ui/`)

The original design-system layer, written for this product. Lives at `apps/frontend/src/components/ui/*.tsx` with **PascalCase filenames**. Components use Tailwind utility classes mapped to CSS variables in `src/styles/index.css`. Exports default or named depending on the component.

Current primitives (12 files):
- `Avatar.tsx`, `Badge.tsx`, `Button.tsx`, `Card.tsx`, `CTA.tsx`, `ErrorBoundary.tsx`, `Input.tsx`, `PageDoodles.tsx`, `Spinner.tsx`, `ThemeToggle.tsx`, `TimelineCardHeader.tsx`, plus `threadUtils.ts` (helpers)

Convention: **stay in-house for product-specific components** (CTA, PageDoodles, TimelineCardHeader, threadUtils). These carry brand voice and don't have off-the-shelf equivalents.

### Layer 2: ShadCN (kebab-case files in `src/components/ui-shadcn/`)

The ShadCN UI scaffolding landed in commit `b6eb0ca`. It's currently configured but empty (no `npx shadcn add` has been run).

ShadCN CLI installs components into the path configured in `components.json`:

```json
"aliases": {
  "components": "@/components",
  "ui": "@/components/ui",
  ...
}
```

**We override this.** The ShadCN `ui` alias resolves to `src/components/ui-shadcn/` (kebab-case files, lowercase, as ShadCN ships them) — **NOT** `src/components/ui/` (which is reserved for in-house). This is enforced by `tsconfig.json` paths:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@/components/ui-shadcn/*": ["./src/components/ui-shadcn/*"],
      "@/components/ui-shadcn": ["./src/components/ui-shadcn/index.ts"]
    }
  }
}
```

And by an explicit override in `vite.config.ts` resolve.alias (when `vite-tsconfig-paths` is wired).

### Layer 3: Shared primitives (single source of truth, eventually)

A future consolidation layer. Today's PR0 stops at "two layers, no collision." A future PR can collapse them by:
- Renaming all in-house files into `Button/index.tsx` (kebab-case dir) so the case-insensitive macOS collision risk is removed.
- OR by lifting ShadCN primitives into `@/components/ds/` and consuming them from both layers.

Out of scope for PR0. Track in `docs/redesign-plan.md` §4.5 / R9.

## Why this matters

- macOS default filesystem (APFS) is case-insensitive. Two files named `Button.tsx` and `button.tsx` in the same folder are the same file.
- The first `npx shadcn add button` would either overwrite the in-house `Button.tsx` (data loss) or fail with a confusing filesystem error.
- This convention removes the collision by giving ShadCN its own folder.

## Adding a new component

**Product-specific** (e.g. a new `WelcomeHero`, a new `OnboardingStepper`, a brand-coloured `TeaDropCard`):
- Add to `apps/frontend/src/components/ui/` with PascalCase filename.
- Export named or default per the existing pattern.
- Consume via relative import or `@/components/ui/Name`.

**Generic primitive** (e.g. a `Dialog`, a `Tabs`, a `Select`, a `Toast`):
- Run `npx shadcn add <component>`.
- ShadCN writes the file to `src/components/ui-shadcn/<component>.tsx`.
- Import via `@/components/ui-shadcn/<component>`.
- Wrap in a project-themed layer if needed (e.g. brand colours override ShadCN's default CSS variables).

## Reviewing the convention

Any PR that:
- Adds a file to `src/components/ui/` (in-house layer) — fine.
- Adds a file to `src/components/ui-shadcn/` (ShadCN layer) — fine.
- **Renames, moves, or deletes a primitive in either layer** — needs design-system review.
- **Cross-imports in-house from ShadCN or vice versa** — needs design-system review.

## Migration plan (future)

1. Rename in-house `*.tsx` → `*/index.tsx` (PascalCase → kebab-case dir) so all components share one filename convention.
2. Merge the two folders into `src/components/ui/`.
3. Update `tsconfig.json` to drop the `ui-shadcn` path mapping.
4. Update every consumer's import paths.

Until that lands: **no `shadcn add` without confirming the convention is in place.**