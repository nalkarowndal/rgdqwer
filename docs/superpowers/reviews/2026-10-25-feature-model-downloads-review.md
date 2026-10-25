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

Final live metadata, Windows/Ubuntu CI and executable artifact evidence pending.
