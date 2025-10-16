# Lint Hygiene Backlog

Last reviewed: 2025-09-06

This backlog captures outstanding ESLint warnings that we intentionally left in place during feature work. Use it as a checklist when we dedicate time to lint hygiene.

## Console Usage Outside Allowed Methods
- Files under `scripts/` emit `console.log/info` for progress messages.
- Test helpers (e.g., `test-date-calculation.js`) print debugging output.
- UI boundaries (`src/components/ApiErrorBoundary.tsx`, `src/components/ErrorBoundary.tsx`) log with `console.log`.
- Fix: swap to `logger` helpers, gate logs behind verbose flags, or locally disable the rule with justification.

## Unused Variables and Parameters
- API routes: `_error` pattern not applied everywhere (`src/app/api/diagnostics/env/route.ts`, `src/app/api/inventory-forecast/route.ts`, etc.).
- Component props/closures define values never read (e.g., `LabKitInventory`, `LabKitAlertsPanel`, `OrdersAndShipmentsView`).
- Tests: helper builders exposing unused methods (`src/__tests__/api/lab-kits-id.route.test.ts`, `src/__tests__/api/subjects-id.delete.route.test.ts`).
- Fix: remove unused bindings or rename to `_var` to document intent.

## React Hook Dependency Warnings
- Missing dependencies in `useCallback`/`useMemo` across lab kit dashboards, members page, visits page, inventory panels.
- Potential over-specified deps causing unnecessary renders.
- Fix: audit hooks, add missing deps, or restructure memoization to avoid stale closures.

## Prefer-Const Violations
- `scripts/fix-compliance-simple.js`, lab kit routines, and timeline components hold reassignable `let` values that stay constant.
- Fix: switch to `const` or annotate intent when mutation is required.

## Scripts Rule Strategy
- Decide whether CLI maintenance scripts should adopt stricter lint rules or be exempt via overrides.
- Proposal: add `scripts/` to `.eslintignore` or attach file-level disable comments once we standardize logging strategy.

## Next Steps
1. Decide on scope (scripts only vs. entire codebase).
2. Allocate time for each bucket; run `npm run lint` after each group.
3. Update this document and the main checklist as items are cleared.
