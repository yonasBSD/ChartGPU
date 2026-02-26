# Design: Auto-Dispose on Page Unload (Issue #139 OOM Fix)

**Date**: 2026-02-26
**Issue**: #139 — "[Bug]: randomly stops working 'not enough memory'"
**Branch**: TBD (new branch from main)

## Problem

When a page with ChartGPU charts is reloaded, `dispose()` is never called. ~728 MB of GPU memory leaks per reload (2 scatter charts, ~50k points each, 4x MSAA at 1080p@2x DPR). After 2-3 reloads, `requestAdapter()` fails with OOM. Firefox (experimental WebGPU) is slowest to GC GPU resources, making it the worst case.

## Root Causes

1. **RC1 (Critical)**: No `beforeunload`/`pagehide` handlers — `dispose()` never called on reload
2. **RC2 (Minor)**: `checkWebGPUSupport()` memoized promise holds adapter reference indefinitely
3. **RC3 (Amplifier, out of scope)**: 4x MSAA triples texture memory per chart

## Solution

Two changes, both in existing files:

### 1. Instance registry + auto-dispose (`src/ChartGPU.ts`)

- Module-level `Set<{ dispose(): void }>` tracking all live instances
- `createChartGPU` adds the instance after creation; `dispose()` removes it
- A single `pagehide` + `beforeunload` listener calls `dispose()` on all tracked instances when the page unloads
- Both listeners registered lazily (on first chart creation) since `dispose()` is idempotent, double-fire from both events is harmless
- `beforeunload` uses `{ once: true }` to minimize bfcache interference

### 2. Adapter leak fix (`src/utils/checkWebGPU.ts`)

- After the `adapter !== null` check, set `adapter = null` so the closure doesn't prevent GC
- Memoization of the `{ supported: true }` result is preserved

## Out of Scope

- Configurable MSAA sample count (separate follow-up issue)
- SPA documentation for manual `dispose()` (follow-up docs PR)

## Testing Approach

- Unit test: verify instance is removed from registry after `dispose()`
- Unit test: verify `disposeAll` (the pagehide handler) disposes all tracked instances
- Unit test: verify double-dispose is safe (idempotent)
- Unit test: verify `checkWebGPUSupport` adapter nulling (adapter doesn't persist in closure)

## Key Files

- `src/ChartGPU.ts` — instance registry, unload listeners, dispose integration
- `src/utils/checkWebGPU.ts` — adapter leak fix
- `src/core/renderCoordinator/gpu/textureManager.ts` — MSAA allocations (context only, not modified)

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auto-dispose default | Always-on | OOM is catastrophic and silent; users won't know to call `dispose()` before reload |
| Instance registry location | Module-level Set in ChartGPU.ts | ~15 lines of code, tightly coupled to createChartGPU lifecycle |
| Unload events | Both `pagehide` + `beforeunload` | Belt and suspenders; dispose is idempotent so double-fire is harmless |
| Adapter leak fix | Null out local after check | One-line fix; memoization preserved for multi-call case |
| MSAA config | Not in this PR | Different scope; auto-dispose alone resolves the reported OOM |
