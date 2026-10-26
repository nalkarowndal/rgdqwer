# Reliable model download review — 2026-10-26 KST

One fresh read-only gpt-6-astra/high review covered `1279e74..6ac5715`. No Critical or Minor findings; no declined-to-judge items. Two Important findings were accepted and fixed in one pass:

- Async disk write failure could leave generator teardown waiting for outstanding range requests and retain model maintenance. Counter/writer error listeners now abort upstream requests before pipeline waits for generator closure.
- Cleanup could replace ENOSPC with a generic cancellation error. Immediate abort carries the original error; downstream failure remains actionable.

Three regressions failed first (slow workers never settled promptly, fast workers masked ENOSPC, maintenance stayed locked) and then passed. They verify prompt settlement, zero remaining active bodies, cleanup, original error identity, failed task state and maintenance release. Focused transfer/storage/catalog/model suite36/36 passed. No re-review dispatched.

Existing task-store failure coverage also exposed dependence on the first progress checkpoint. Retain that first checkpoint, then space checkpoints five seconds apart. Live progress remains available through inventory and completed components stay durable. Checkpoint test observed13 writes before the change and at most2 afterward over the same12 progress updates.

The implementation preserves verified atomic no-overwrite storage, public HTTPS and DNS validation, and original-URL redirect refresh. Range workers use bounded windows; total speed is not guaranteed. Recovery is within the active task, not persistent partial-file reuse after restart. User-specific network/provider logs were unavailable, so these fixes address reproduced code weaknesses without claiming all possible bottlenecks are identified.

Local initial browser21/Python22/build passed. Final typecheck/lint/unit suite and Windows actual provider/standalone verification are recorded below when complete. Reviewer localhost tests were blocked by its restricted network sandbox; executor tests use permitted local sockets. No new dependencies or public release/merge.
