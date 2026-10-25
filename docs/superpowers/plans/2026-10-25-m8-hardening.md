# M8 Package Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove bundled nonruntime dependency fixtures and verify Korean/space paths.
**Architecture:** Existing builder files exclusions plus independent archive guard; existing owned-profile lifecycle smoke.
**Tech Stack:** electron-builder26.18.0/Electron43.8.1/TypeScript/Playwright/PowerShell.
**Spec:** docs/superpowers/specs/2026-10-25-m8-hardening.md

## Global Constraints
- Keep version0.9.0, x64 current-user NSIS, external engines, unsigned publish-never, no merge/public release.
- Preserve runtime JS/JSON/WASM/notices and existing installation/profile refusal guards.
- Real models/GPU/clean-client/signing acceptance remains withheld.

## Review Focus
- Nested/scoped dependency paths and Windows separators must be covered (Task1).
- Runtime files containing test/spec words must remain usable (Task1).
- Korean/space install/profile paths must reach the actual exe without shell splitting (Task2).
- Existing personal installations/profiles must remain protected (Task2).
- Archived evidence must not overstate hosted Windows or simulated inference (Task2).

### Task1: Package contents
**Files:** electron-builder.json, scripts/verify-payload.ts, tests/payload.test.ts.
**Interfaces:** validateArchiveEntries(entries:string[]) rejects dependency test/spec/fixture/benchmark directories; verifyPayload still checks external Python/WASM/notices.
- [x] Add RED nested/scoped/Windows-separator cases and positive runtime filename cases.
- [x] Implement negative globs and independent validator rule.
- [x] Run npm run check; build actual Linux pack; verify smaller ASAR and retained required resources. Expected PASS.
- [x] Commit.

### Task2: Unicode paths, documentation and verification
**Files:** scripts/verify-installer.ps1, docs/DEVELOPMENT_PHASES.md, docs/QA_TEST_PLAN.md, docs/RELEASE_CHECKLIST.md.
**Interfaces:** existing smoke CLI with Korean/space absolute executable/profile paths; actual runtime cwd/profile assertion.
- [x] Set owned CI installation/profile names to include Korean and spaces; retain all ownership guards and NSIS syntax.
- [x] Launch actual Linux package from Korean/space installation path, seed/restart with Korean/space profile. Expected PASS.
- [x] Update stale roadmap and payload finding status; commit.
- [x] One fresh final review; one Important/Critical fix pass with regressions, defer Minors.
- [x] Create/attach draft PR over M8; Windows/Ubuntu CI including actual installer lifecycle PASS; record exact code/artifact evidence.

Completed: implementation f31dece, Windows/Ubuntu CI43 success including actual Korean/space NSIS lifecycle. Real-device/signing/accessibility gates remain open.
