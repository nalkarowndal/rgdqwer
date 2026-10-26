# Image LoRA / Anima review — 2026-10-26 KST

One fresh read-only gpt-6-astra/high review covered3485f6d..989e36a and relevant callers. No Critical/Important findings. One Minor: HTML step=.05 rejected otherwise valid strengths such as0.66, even in an off row. Browser reproduction failed before submission with0.66. Fix to step=any aligns UI with bounded finite API values; existing browser scenario now uses0.66 through toggle/generation/history restore. This useful scoped correction follows developer guidance rather than deferring a reversible fix. No second review requested.

## Decisions and review dispositions

- Explicit implementation request and established session authorize proceeding without another design-approval menu. Work stays on a new branch of the existing clean checkout; prior branches preserved. Inline implementation plus one fresh review; cloud skill scripts unavailable, equivalent ledger maintained manually.
- Default maximum4 independently toggled rows, one shared SD model/CLIP strength, saved order, explicit profile labels. Changing profile turns all rows off; users can switch back and reactivate. Row reordering, separate strengths and unsent-draft persistence beyond the existing session remain out of scope. Completed/submitted jobs preserve settings for reuse.
- Anima Base v1 uses the official ComfyUI template (blob71466ab44b22aa8d7262e0bed1b4f2fc58700408). CLIPLoader type is stable_diffusion, not an invented anima enum. No separate inference engine or dependency installation.
- Actual inference/quality/VRAM/speed/real LoRA architecture compatibility: no full weights or GPU here; do not claim those checks. Filename inventory and explicit profile labels cannot prove weight compatibility. Users must choose matching files. Exact-basename Anima suggestions are convenience, not provenance checks. SD checkpoints also require users to choose the correct family.
- Provider availability/current metadata: Windows live smoke is required before distributing the new artifact. Source/license pointers came from official Exa/Context7/GitHub pages; no legal certification. Anima and Krea VAE files remain separate provider bundles; equal basenames do not establish byte/license identity.
- Windows packaging and CI: final evidence recorded below. A draft PR is not a public release or merge.
- Reviewer did not re-review the CI fixture race. CI61's Ubuntu trace showed a previous SD 'a forest' job in unknown/fetch-failed state after its simulated engine closed. New tests had matched the preceding job's 완료 too early. They now await the exact submitted prompt_id's completed API state before cleanup. This changes test synchronization, not production job locking. Other studios were correctly blocked by the unfinished job. Windows was cancelled by matrix fail-fast, not reported successful.
- Manually corrupted DB records: not a new migration contract; normal API input stays validated and old legitimate jobs without new fields remain supported. Malformed external edits may need user recovery.
- Off-row files/loaders: skipped correctly; no change required. Duplicate active rows: API rejects before job creation with an actionable error; UI need not silently remove user settings.
- CLIPLoader default device inventory: stock official loader supports it; no demonstrated incompatibility justifies a speculative custom-loader branch. Custom incompatible nodes may fail on execution.
- Inventory can change after preflight; fresh validation minimizes the external race without claiming an atomic lock on another process. Missing active files fail visibly.
- Existing generic asset-reference matching/LoRA diagnostics: no demonstrated regression; kept unchanged. Formatting preferences: no functional finding or unrelated refactor.
- Reviewer performed focused read-only schema/graph/catalog assertions; browser micro-probe was blocked by sandbox socket permissions. Full runtime evidence comes from executor and CI, not an independently repeated suite.

## Validation

Initial local typecheck/lint/JS172/build and all21 browser tests passed. Observed RED for missing image module, missing LoRA/Anima UI, absent Anima catalog, prompt-studio profile transition leaving an active incompatible LoRA, and valid0.66 HTML strength submission. Fixed transition through all profile-change paths and refreshed checkpoint list using current inventory. Legacy catalog tests now identify by bundle+filename and feature id rather than ambiguous basename/array index; expected feature count increased8→9.

After the precision/synchronization correction: local typecheck/lint/JS172/build and all21 browser tests pass. Final Windows/Ubuntu distributable evidence follows. Actual full model/GPU inference is not verified.


## Final artifact verification

[CI63](https://github.com/nalkarowndal/rgdqwer/actions/runs/40262277365) passed Windows and Ubuntu on implementation `c38bb5bba11ce4a6746d67821e796a2d78143a19`. Both: JS172/typecheck/lint/build, Python22, browser21 and20 simulated lifecycle cycles. Windows additionally resolved all29 catalog files/seven repositories and downloaded WD14 CSV253,906bytes and Chatterbox ve.pt5,698,626bytes through production size/SHA256 verification. Full metadata report now survives Playwright and is saved in [catalog evidence](../../qa/image-lora-anima-model-catalog.json).

Anima Base v1 components resolve at provider revision `f973fc41ec7545364ac9776c2440285f43ff2a30`: diffusion4,182,218,328bytes, encoder1,192,135,096bytes, VAE253,806,246bytes. These large files were metadata-checked, not downloaded or loaded for inference.

Actual unsigned Windows x64 ZIP extraction/execution, relocation, retained settings/synthetic model, and installer install/upgrade/uninstall/data-retention passed in hosted CI. QA archive was downloaded and its SHA256 independently matched before copying reports. [Executable evidence](../../qa/image-lora-anima-windows.json) includes distribution/inner-ZIP hashes and security preferences.

[Download standalone ZIP](https://github.com/nalkarowndal/rgdqwer/actions/runs/40262277365/artifacts/12625102914) (expires2026-11-09 12:15 KST), [installer](https://github.com/nalkarowndal/rgdqwer/actions/runs/40262277365/artifacts/12624748739). [Draft PR12](https://github.com/nalkarowndal/rgdqwer/pull/12) is attached and stacked on `codex/feature-model-downloads`. No merge/public release. Final follow-up changes only download links/documentation/evidence; the linked application remains the tested implementation above. No new runtime checks were needed for those prose/evidence updates.
