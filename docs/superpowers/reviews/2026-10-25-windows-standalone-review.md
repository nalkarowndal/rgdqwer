# Windows standalone review — 2026-10-25 (KST)

One fresh read-only gpt-6-astra/high reviewer inspected `e5c6f88..adf11b4`, including pinned electron-builder filename precedence and ZIP archive layout. No Critical or code-level Important issues. One documentation finding: standalone instructions referenced `$resources`, absent from the Worker example. The actual variable is `$studioInstall`.

## Disposition and rulings

- The reviewer called the variable mismatch Minor. Executor grades its effect Important for ZIP-only users following the sole Worker setup path: the unchanged example would select a nonexistent installed directory. Corrected the instruction to assign `$studioInstall` to the extracted app root, feeding both `$studioPythonSources` and the later voice launch. The before/after references were checked directly against both examples. Per developer guidance, this reversible documentation fix adds no implementation-mirroring test; runtime code is unchanged and the full suite was already green. No second review was dispatched.
- Choose a full folder ZIP over a self-extracting launcher: it matches the requested visible exe/folder experience without adding startup extraction or launcher code. The exe depends on accompanying resources/DLLs; docs explicitly require whole-folder extraction.
- Keep existing AppData storage and app identity. This is installation-free launch, not a USB-contained profile. Cross-PC data/model migration and automatic migration are outside scope and not claimed.
- Reviewer declined actual extracted/relocated Windows execution until CI: require successful current Windows CI plus archive/report inspection before completion. Linux tests alone do not prove this behavior.
- Reviewer declined clean Windows10/11, SmartScreen, real GPU/model inference and microphone behavior: manual validation remains open; unsigned hosted validation does not establish those properties.
- Reviewer declined live installed/ZIP coexistence against a real default profile: runtime identity and path code are unchanged; isolated lifecycle tests protect user data but do not prove a live-user migration. Shared default AppData is documented, with the existing single-instance behavior; no independent coexistence test is claimed.
- Reviewer declined signing, automatic updates and public-release readiness: they remain excluded. No publishing or merging is authorized/performed.
- Reviewer did not independently rerun the full suite: executor observed two new tests RED then GREEN, all148 JS tests/typecheck/lint/build pass, and pinned builder schema validation pass. CI is independent execution evidence, not independent reproduction of the RED step.
- Existing checkout reused on a new branch, preserving previous branches. Cloud skill helper scripts were unavailable, so equivalent plan/ledger/review artifacts were maintained manually. No implementation delegation.

## Verification

Local: `npm run check` passed typecheck, lint and148 tests across26 files; `npm run build` passed. Artifact selection tests cover unrelated/missing/ambiguous files, standalone/installer separation and matching blockmap. The actual Windows ZIP extraction/relocation CI and artifact evidence will be appended after completion. Default user-profile and real-inference limitations remain explicit.
