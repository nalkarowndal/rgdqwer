# Windows Standalone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Supply a downloadable Windows ZIP with a directly runnable studio exe.
**Architecture:** Reuse electron-builder packaged payload, add ZIP alongside NSIS; validate extracted/moved executable in Windows CI.
**Tech Stack:** Electron 43.8.1, electron-builder 26.18.0, TypeScript, PowerShell, GitHub Actions.
**Spec:** docs/superpowers/specs/2026-10-25-windows-standalone-design.md

## Global Constraints

- x64, unsigned, `--publish never`, no merge or public release.
- Preserve NSIS naming and runtime/AppData/security behavior.
- No AI runtimes/models bundled; no inference claim.
- QA only adopts unique owned paths and isolated profile; no user-data deletion.

## Review Focus

- Missing runtime/DLL/resource files: run actual extracted ZIP, not win-unpacked.
- Korean/space paths and changed cwd: extracted/moved app with isolated profile as cwd.
- Lost settings/models on folder move: seed then verify through existing packaged smoke.
- Misleading portable/data/exe-only expectations: root quick-start and installation docs explicitly describe full folder and AppData.
- Stale/multiple artifacts or setup ZIP confused with standalone: selection tests and separate checksum/upload paths.

### Task 1: Build and validate standalone distribution

**Files:** electron-builder.json, package.json, scripts/package-checks.ts, scripts/release-checksums.ts, tests/package-smoke.test.ts, scripts/verify-standalone.ps1, .github/workflows/ci.yml, docs/START_HERE.txt, docs/INSTALLATION.md, docs/RELEASE_CHECKLIST.md.
**Interfaces:** Existing smoke accepts absolute --executable/--profile, seed|verify, --report. Add `releaseArtifactFiles(files: string[], kind: 'installer'|'standalone'): string[]`; checksum CLI accepts kind as third argument (after directory), defaults to installer, standalone writes SHA256SUMS-standalone.txt.

- [x] Add tests for standalone and installer selection, unrelated files ignored, missing/ambiguous primary rejected, blockmap only for selected installer; run targeted Vitest and observe RED.
- [x] Implement selection/manifest CLI, ZIP target and package commands. Expected targeted tests GREEN, typecheck/lint pass.
- [x] Add Windows CI-only actual ZIP extraction, seed, move and verify script; use unique Korean/space paths and explicit reports, validate SHA256 against selected ZIP. Upload independent standalone artifact after both lifecycle checks pass. Add quick-start and update documentation.
- [x] Run `npm run check` and `npm run build`. Expected all pass; commit implementation.
- [x] One fresh whole-branch review, resolve Important/Critical in one test-backed pass and record rulings.
- [ ] Push branch/open attached draft PR based on codex/m8-package-hardening; inspect Windows/Ubuntu CI and actual standalone artifact/reports. Expected ZIP extraction+relocation successful, existing checks green. Save review/evidence and download link, keep manual device gates explicit.
