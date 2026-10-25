# Image LoRA and Anima Implementation Plan

> Use superpowers:executing-plans inline, with one final fresh reviewer.

**Goal:** Image Studio LoRA on/off and Anima generation/download.
**Architecture:** Extend ImageInput and prompt profile; shared image inventory/issues; official graph; existing catalog/task lifecycle.
**Tech Stack:** React/TypeScript/Fastify/SQLite/ComfyUI/Vitest/Playwright.
**Spec:** docs/superpowers/specs/2026-10-26-image-lora-anima-design.md

## Global Constraints
Old requests/jobs without new fields remain valid. Maximum4 LoRAs, strength -2..2. Disabled entries preserve configuration and do not affect execution. No new dependencies or runtime installs. No full model inference claim.

## Review Focus
- Disabled missing LoRA and missing loader must not block base generation (task1).
- Profile transition and history restore must not enable incompatible adapters (task2).
- Stale inventory must fail before queue submission, off rows remain reusable (task1).
- Anima independent encoder/VAE and official sampler must be wired correctly (task1).
- Dynamic nine-feature batch and current-root paths remain valid (task2).

### Task1: Validated graph and inventory
Files: src/contracts.ts, src/image.ts, src/prompt.ts, server/generation/workflow.ts, image.ts, client.ts, manager.ts, server/app.ts; tests/image.test.ts and image-api.test.ts, fixtures/image.ts.
Interfaces: ImageInventory, inspectImage(raw), imageIssues(input,inventory); GET /api/image/status; preflight(input:ImageInput).
- [x] RED tests for active/off LoRA graph and malformed settings, Anima graph and inventory checks.
- [x] Implement optional persisted settings, Anima profile, conditional graph, authoritative preflight and authenticated status.
- [x] Run focused and full check; commit.

### Task2: UI and catalog
Files: src/ImageStudio.tsx, src/ImageLoras.tsx, App.tsx, model-catalog.ts, CSS; e2e/image-lora-anima.spec.ts; docs.
Interfaces: existing image draft includes rows, inventory UI loads image/status, download feature anima selects3files.
- [ ] RED browser tests for row toggles retaining file/strength, profile reset/reuse and Anima fields; catalog test all9.
- [ ] Implement UI, source/setup docs and Anima catalog.
- [ ] Check/build/full browser tests and screenshots; commit.

### Task3: Review and Windows distribution
- [ ] One independent final review, resolve findings, preserve rulings in review record.
- [ ] Push draft PR stacked on feature-model-downloads and attach; inspect Windows/Ubuntu CI and actual live model metadata + executable reports.
- [ ] Update artifact links and verification records; final Korean usage instructions. No merge/public release.
