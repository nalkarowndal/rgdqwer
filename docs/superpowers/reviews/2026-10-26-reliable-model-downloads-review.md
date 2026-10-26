# Reliable model download review — 2026-10-26 KST

One fresh read-only gpt-6-astra/high review covered `1279e74..6ac5715`. No Critical or Minor findings; no declined-to-judge items. Two Important findings were accepted and fixed in one pass:

- Async disk write failure could leave generator teardown waiting for outstanding range requests and retain model maintenance. Counter/writer error listeners now abort upstream requests before pipeline waits for generator closure.
- Cleanup could replace ENOSPC with a generic cancellation error. Immediate abort carries the original error; downstream failure remains actionable.

Three regressions failed first (slow workers never settled promptly, fast workers masked ENOSPC, maintenance stayed locked) and then passed. They verify prompt settlement, zero remaining active bodies, cleanup, original error identity, failed task state and maintenance release. Focused transfer/storage/catalog/model suite36/36 passed. No re-review dispatched.

Existing task-store failure coverage also exposed dependence on the first progress checkpoint. Retain that first checkpoint, then space checkpoints five seconds apart. Live progress remains available through inventory and completed components stay durable. Checkpoint test observed13 writes before the change and at most2 afterward over the same12 progress updates.

The implementation preserves verified atomic no-overwrite storage, public HTTPS and DNS validation, and original-URL redirect refresh. Range workers use bounded windows; total speed is not guaranteed. Recovery is within the active task, not persistent partial-file reuse after restart. User-specific network/provider logs were unavailable, so these fixes address reproduced code weaknesses without claiming all possible bottlenecks are identified.

Local initial browser21/Python22/build passed. Final typecheck/lint/unit suite and Windows actual provider/standalone verification are recorded below when complete. Reviewer localhost tests were blocked by its restricted network sandbox; executor tests use permitted local sockets. No new dependencies or public release/merge.

Final local checks on implementation `1837227e7af76c53a7e015d53eeb15e9333ec668`: typecheck/lint,188 tests in33 files, and production build pass. Browser21/Python22 also pass. [Draft PR13](https://github.com/nalkarowndal/rgdqwer/pull/13) is stacked on `codex/image-lora-anima`; no merge or public release. [CI67](https://github.com/nalkarowndal/rgdqwer/actions/runs/40316979809) Ubuntu completed with188 JavaScript,22 Python,21 browser checks and20 simulated lifecycle cycles. Windows completed all checks, including actual provider downloads, installer and extracted standalone executable verification.

## Final Windows artifact evidence

[CI67](https://github.com/nalkarowndal/rgdqwer/actions/runs/40316979809) passed on both Windows and Ubuntu for implementation `1837227`. Both platforms passed188 JavaScript tests,22 Python tests,21 browser tests and20 simulated lifecycle cycles. Windows resolved29 catalog files across7 repositories and downloaded WD14 CSV253,906bytes plus Chatterbox ve.pt5,698,626bytes using production verification. ve.pt returned4 successful HTTP206 ranges (8 Range-bearing requests including redirects); SHA256 matched the provider metadata. This demonstrates real range interoperability, not a throughput benchmark or full multi-GB model/inference test.

The Windows QA archive was downloaded and its SHA256 matched the artifact digest before inspecting reports. Actual standalone extraction, executable startup, Unicode/space paths, relocation and retained settings/synthetic model passed. Installer install/upgrade/uninstall/data-retention checks passed too. [Provider evidence](../../qa/reliable-model-downloads-catalog.json) and [Windows evidence](../../qa/reliable-model-downloads-windows.json) record exact results and hashes.

[Standalone ZIP](https://github.com/nalkarowndal/rgdqwer/actions/runs/40316979809/artifacts/12648120760) expires2026-11-09 20:50 KST. [Optional installer](https://github.com/nalkarowndal/rgdqwer/actions/runs/40316979809/artifacts/12647447548). Final follow-up changes update only documentation, download links and evidence; the executable remains the verified implementation above. No unaddressed findings or deferred minors. No merge/public release.
