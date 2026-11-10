# 0001 — High Risk systems reach the UI behind a toggle

**Status:** Accepted
**Date:** 2026-11-09

## Context

The engine previously discarded every `High Risk` combination inside
`buildCombinations`. The UI still shipped `High Risk` branches, so those branches
were dead code, and a user whose load genuinely needed an undersized system was
shown "No Matching Systems" with no explanation.

## Decision

Keep High Risk combinations in `validSystems` and filter them at the UI boundary
instead. A `showHighRisk` toggle on the calculator page controls visibility and
defaults to on.

## Consequences

- The High Risk branches in the results list, details modal and quote PDF are
  reachable.
- Undersized load profiles produce a warned option rather than an empty result.
- Every engine test that asserted "High Risk is never returned" is now wrong.
  Assertions must check the toggle instead.

## Alternatives rejected

**Filter in the engine.** Simpler, but forces the UI to own a parallel
"explain why nothing matched" path for the same information.
