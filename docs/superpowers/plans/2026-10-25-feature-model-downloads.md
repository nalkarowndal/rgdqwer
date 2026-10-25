# Feature Model Downloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement inline.

**Goal:** Select feature cards and download complete model bundles inside the studio.
**Architecture:** Curated shared catalog → bounded Hugging Face metadata resolution → existing single ModelManager task/stream storage → feature status and selection UI.
**Tech Stack:** TypeScript/React/Fastify/SQLite, Node HTTPS, Vitest/Playwright, existing Windows packaging.
**Spec:** docs/superpowers/specs/2026-10-25-feature-model-downloads-design.md

## Global Constraints
- No new AI engines; no arbitrary remote-code execution or Python installation.
- Existing authenticated loopback, HTTPS/public DNS, proxy refusal, never-overwrite, maintenance lock and cancellation stay intact.
- Model file readiness is distinct from engine/inference readiness.
- Current managed root is the target; changing root changes the catalog's counted files, without moving/removing old files.
- Shared files deduplicate, partial retries pin the same provider revision, completed files persist.

## Review Focus
- Upstream mutable main/renames/missing metadata and ordinary Git files: pin commit, bound reads, verify blob/hash, actionable failure.
- Interrupted bundle, app restart and duplicate selections: persist completed assets, reuse them, single task and original revision.
- Existing/moved/corrupt/symlink files and disk limits: status check then hash before reuse, no overwrite, test real files.
- User mistakes readiness or external setup for working inference: explicit file-ready labels and paths/engine steps.
- UI polling/race and navigation/mobile/keyboard: stable IDs, polling ownership, disabled submission, accessible checkbox tests.

### Task 1: Curated catalog and metadata resolver
**Files:** src/model-catalog.ts, server/models/catalog.ts, tests/model-catalog.test.ts, model schema/files extensions for CSV.
**Interfaces:** feature definitions reference unique file IDs; resolver accepts catalog file IDs plus revision hints and injected HTTPS transport, returns DownloadModelInput values. Pure catalog selection and status contracts shared with UI.
- [x] Write failing resolver tests for LFS, Git config hash, pinning, bad metadata and duplicate/shared IDs; observe RED.
- [x] Implement bounded metadata/redirect reader and allowlisted file catalog. Keep file names and Worker bundles intact; permit WD14 CSV as data only.
- [x] Run focused tests, type/lint; commit. Expected GREEN.

### Task 2: Batch installation and authenticated readiness API
**Files:** server/models/manager.ts, server/models/routes.ts, tests/model-catalog-install.test.ts, tests/model-api.test.ts.
**Interfaces:** GET /api/models/catalog returns root/features/file readiness; POST /api/models/catalog/download {featureIds,confirmed:true} returns existing ModelTask. Add optional currentFile to task; use existing cancel endpoint.
- [x] Failing tests using actual DB/files and injected bounded response streams: shared/reused files, partial failure/cancel/retry, fixed revision, modified files/conflicts, busy lock and bad inputs.
- [x] Implement batch download under existing task lifecycle and maintenance lock. Preflight total space and keep verified prior components. Current root only, consistent bundle versions.
- [x] Run full check and commit. Expected all tests pass.

### Task 3: Feature download screen, documentation and distributable
**Files:** src/FeatureModels.tsx, src/ModelManager.tsx, src CSS, e2e/model-catalog.spec.ts, docs/README, scripts/verify-model-catalog.ts, CI.
**Interfaces:** UI uses catalog API and current model tasks; no URL/hash input for curated bundles. Metadata smoke queries public providers/small config files only, separate from fixture tests.
- [x] Browser coverage first: select/multi-select, shared estimate, rights/button states, submit/error/progress/retry/file-ready and mobile/keyboard. Expected missing UI RED.
- [x] Add screenshot-like two-column feature cards, sizes, count, file/source/setup details and selected download action. Keep manual import/download available.
- [x] Run check/build/e2e, inspect rendered screenshots, commit. Expected GREEN.
- [x] One fresh whole-branch review; one Important/Critical fix pass; record all rulings.
- [ ] Open attached draft PR on codex/windows-standalone, inspect Windows/Ubuntu CI, public metadata smoke and built ZIP execution. Supply updated Windows executable download and evidence. No merge/public release.
