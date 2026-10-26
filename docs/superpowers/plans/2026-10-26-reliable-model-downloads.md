# Reliable model downloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Recover interrupted model transfers and reduce download overhead.
**Architecture:** Bounded range workers feed the existing verified atomic file writer. Live task snapshots decouple progress polling from database checkpoints.
**Tech Stack:** TypeScript, Node HTTPS/streams, Vitest, Electron Windows CI.
**Spec:** docs/superpowers/specs/2026-10-26-reliable-model-downloads.md

## Global Constraints
- Preserve public HTTPS/DNS checks, pinned catalog revisions, SHA256 verification, size/space bounds, cancellation, atomic no-overwrite installation, and completed-component reuse.
- At most four concurrent ranges; 1–16 MiB segments; three attempts; five-second progress checkpoints.
- No persistent partial-file reuse or full model download required for validation.

## Review Focus
- Signed CDN redirects expire during retry: refresh original URL, preserve URL security on every hop.
- Servers ignore or lie about ranges: fall back only before any bytes, reject mismatched ranges.
- A later parallel worker fails while an earlier one is slow: observe every rejection and cancel all workers.
- Cancellation during backoff or disk failure must release resources and maintenance lock.
- Polling during checkpoint gaps must see current bytes; terminal state must survive reopen.

### Task 1: Resilient transfer
**Files:** server/models/network.ts, server/models/download.ts, server/models/transfer.ts (new), tests/model-download.test.ts, tests/model-transfer.test.ts (new).
**Interfaces:** Add optional `{range?: string}` third transport argument; expose Content-Range/Length/Encoding/Retry-After response headers. Keep downloadAsset's call contract and verified storeStream result.
- [x] Add failing tests for reset+offset resume, bounded out-of-order ranges, range fallback/mismatch, transient HTTP exhaustion, refreshed redirects, cancellation/backoff, integrity and cleanup.
- [x] Run `npx vitest run tests/model-transfer.test.ts`; expected failures on current implementation.
- [x] Implement three-attempt retry (500/1000 ms, Retry-After capped at 10 seconds), four-range windows, strict lengths/ranges, friendly exhaustion, 120-second socket inactivity timeout and optional Range transport.
- [x] Run `npx vitest run tests/model-download.test.ts tests/model-transfer.test.ts`; expected PASS. Commit.

### Task 2: Live progress without synchronous write churn
**Files:** server/models/manager.ts, tests/model-catalog-install.test.ts, docs/model-downloads.md (new).
**Interfaces:** Task 1 transport remains injectable; inventory overlays the active task snapshot; no API schema changes.
- [x] Add failing test with controlled clock proving live received bytes during a five-second checkpoint gap and bounded DB writes; retain final durability and cancellation.
- [x] Run target test; expected FAIL. Implement five-second checkpoint cadence and active snapshot overlay, inject transport for manual downloads too.
- [x] Update failure test polling budgets to cover intentional bounded retry, and cancellation polling to use live inventory.
- [x] Run `npx vitest run tests/model-catalog-install.test.ts tests/model-transfer.test.ts`; expected PASS. Document recovery limits; commit.

### Task 3: Review and Windows artifact verification
**Files:** docs/superpowers/reviews/2026-10-26-reliable-model-downloads-review.md, docs/qa/*download*.
**Interfaces:** Existing Windows CI live catalog smoke uses production downloadAsset for real small files, including a 5.7 MB file exercising ranges.
- [x] Run `npm run check`, `npm run build`, Python tests and browser suite; expected PASS.
- [x] One fresh whole-branch review; fix important findings with RED→GREEN coverage.
- [x] Push feature branch and create stacked draft PR; no merge or public release.
- [x] Verify Windows CI including actual provider downloads, standalone ZIP extraction and executable startup; link artifact and record evidence.
