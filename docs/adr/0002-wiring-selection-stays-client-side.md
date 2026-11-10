# 0002 — Wiring selection stays client-side

**Status:** Accepted
**Date:** 2026-11-10

## Context

Wiring items are a shared catalogue: admins edit them in D1, every user sees the
same list. The only per-user state is which `nice-to-have` items a user wants to
include in a given quote.

Options were: persist selections in D1 against a user id, or keep them in the
browser.

## Decision

Keep nothing in D1. The catalogue is the admin-owned list; the selection is a
`Set<string>` in `App.tsx` persisted to `localStorage` under `ss_wiring_v2`, and
passed into `buildCombinations` as `selectedNiceToHave: string[]`.

## Consequences

- No user table, no auth requirement, no write path for the selection.
- A user who clears browser storage loses their optional-item choices but not
  their hardware, which is mirrored to IndexedDB via `storeSet`.
- Quotes are reproducible only while the selection snapshot is attached to the
  saved result (`selected_nice_to_have`).
- Cross-device sync of the selection is not possible. Acceptable: the selection
  is per-quote, not a profile setting.

## Alternatives rejected

**D1 per-user rows.** Requires a user identity that the app does not have, and
turns an ephemeral UI preference into a migration surface.
