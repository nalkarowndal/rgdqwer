# Feature model download review — 2026-10-25 (KST)

One fresh read-only gpt-6-astra/high reviewer inspected `c59a9a2..b1c8d78`. No Critical/Important findings. One Minor: changed-file status told users to delete a modified model, but the existing deletion guard refuses changed bytes. The supported path is to back up/move the conflicting file, then retry so missing-file repair retains its asset ID. Corrected status/task wording and the user guide in one copy-only pass. No behavior change or second review. Per developer guidance, no tests mirroring this reversible text edit were added; existing modified/missing file lifecycle coverage is retained.

## Decisions and declined judgments

- Implement the user's explicit request directly with stated defaults in a new branch of the existing checkout. Prior branches are preserved. No extra approval menu or implementation delegation. Cloud skill scripts were unavailable; equivalent plan/ledger/review files were maintained manually.
- Use the screenshot's feature-selection interaction for the app's eight implemented feature bundles. No unsupported LLM/MiniMax/Anima engine claims; RVC custom voices and extra LoRA remain manual imports. This trades breadth for downloads matching actual adapters.
- Reuse existing HTTPS/DNS/stream/lock/cancellation logic. Current managed root determines file readiness; changing it can download a separate copy. No automatic cross-root move or overwrite.
- Resolve current provider metadata to immutable commit URLs per batch; partial retries use the already registered revision. Users do not enter hashes/sizes, and mismatched provider metadata fails before weights are installed. Upstream removal/access changes can still make a download fail visibly.
- Preserve registered asset IDs/metadata when restoring missing bytes. Require the same pinned size/hash; existing INSERT-only store remains unchanged. Historical references survive repair. Modified conflicting files must be moved/backed up manually, never silently deleted.
- Default model manager tab becomes feature download; engine inventory remains in installed-list. The existing navigation test was updated to choose that tab explicitly. Shared-file selection excludes already completed files.
- File readiness checks existence/size/revision consistency, not a full hash every polling cycle; reuse checks the full hash. Ready files still need ComfyUI path configuration/restart or independent Python/Worker/FFmpeg setup. No new engine installation or inference-readiness claim.
- Reviewer deferred live upstream availability/metadata/license accuracy. Development workspace HTTP policy denies huggingface.co; no bypass attempted. Exa official pages, Context7 and the official GitHub template informed paths/licenses. Windows CI performs live metadata plus bounded small Git configuration verification. License pointers are shown; this is not legal certification. Initial CI53's live check passed; final artifact evidence is appended below.
- Reviewer deferred real model loading/output/GPU/VRAM: fixtures and metadata checks cannot establish inference. No multiGB weights/GPU test is claimed.
- Reviewer deferred actual Windows ZIP/installer execution: require current packaged CI, actual extracted/moved smoke and reports before distribution. Linux tests alone are insufficient.
- Reviewer deferred automatic runtime installs and screenshot-only engines: excluded as above. Byte-range resume is excluded: completed files persist, incomplete files restart from zero; app restart never silently downloads.
- Reviewer deferred hard process termination precisely between filesystem publication and DB registration. No new crash-atomic claim: an unregistered published file is never overwritten; users can back it up/move it and retry. Inherited temp cleanup and DB-write-failure rollback are tested, but a power-cut fault at that boundary was not injected.
- Reviewer did not independently rerun the full suite. Executor observed resolver/API/UI RED→GREEN and161 JS tests/type/lint/build plus18 browser tests passing, including real files/SQLite. Independent CI execution is evidence of runtime checks, not independent reconstruction of RED.

## Validation

Local typecheck/lint/JS161/build and browser18 pass. New lifecycle tests cover shared/reused files, partial failure/retry, abort/temp cleanup, retained IDs for missing files, changed bytes, current-root status, unmanaged collisions, symlinks, DB reopen, space rejection and DB rollback. Browser tests cover real catalog API, selection/rights, error/cancel/retry/status, keyboard and390px layout. Desktop/mobile screenshots inspected.

Verification extension after review: the Windows live smoke also downloads WD14 tags CSV and the small Chatterbox ve.pt component (each capped at8MiB) through the existing production downloader and removes only its owned temporary directory. This closes the real redirect/stream/hash path gap without downloading full multiGB bundles or executing model code. Final CI evidence follows.


## Final distributable evidence — 2026-10-26 (KST)

[CI57](https://github.com/nalkarowndal/rgdqwer/actions/runs/40191758197), implementation `1aec20f31c285f0603c865ec61d494767639f999`, passed on Windows and Ubuntu. Each ran JS161, Python22, browser18, typecheck/lint/build and 20 simulated-engine lifecycle cycles. Windows verified public metadata for all26 files/six repositories and really downloaded WD14 tags (253,906 bytes) and Chatterbox ve.pt (5,698,626 bytes) with production stream/size/SHA256 verification. No full bundle/GPU inference was run.

Windows produced and executed both the NSIS installer and standalone ZIP. The ZIP was extracted into a Korean/space path, launched, moved and launched again with settings and the synthetic model retained. Installer install/upgrade/uninstall retained data. QA artifact SHA256 was independently checked after downloading. Reports: [catalog log evidence](../../qa/feature-model-catalog-windows.json), [packaged evidence](../../qa/feature-model-downloads-windows.json).

The live catalog JSON was absent from the QA archive: Playwright clears its default test-results directory after the earlier live check. The successful step and exact component hashes remain in the job log; the committed catalog evidence is explicitly a log summary, not the missing full report. Move the live check after browser tests so future QA archives retain it. This CI ordering correction does not change the distributed application; the linked executable remains the tested `1aec20f` build. No extra app test cycle or review was needed for evidence/docs and this ordering-only correction.

[Standalone artifact](https://github.com/nalkarowndal/rgdqwer/actions/runs/40191758197/artifacts/12598890339) expires 2026-11-08 21:18 KST. [Draft PR11](https://github.com/nalkarowndal/rgdqwer/pull/11) is stacked on `codex/windows-standalone`, attached to the task; not merged or publicly released.
