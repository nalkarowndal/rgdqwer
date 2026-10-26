# Reliable model downloads

The feature downloader must recover from temporary connection resets instead of showing raw `aborted`, and reduce avoidable download overhead. Preserve public HTTPS/DNS checks, pinned catalog revisions, SHA256 verification, size/space bounds, cancellation, atomic no-overwrite installation, and completed-component reuse.

Use at most four concurrent HTTP ranges for files of at least 4 MiB, with 1–16 MiB segments and bounded memory. Validate Content-Range and identity encoding. A server ignoring the initial Range request falls back to a single stream. Retry temporary network/HTTP failures at most three attempts with cancellable bounded backoff. Retry from the original URL to refresh redirects; never modify a signed CDN URL. Sequential interrupted streams resume from their consumed offset only when the server honors the range. A server refusing resume fails clearly, without appending a duplicate full file.

Progress remains live in memory; persist checkpoints at most every five seconds, with durable start/detail/final records. Cancellation or exhausted failure removes the incomplete current file; completed components remain. This is recovery within an active task, not persistent partial-file resume after app restart. No promise of a particular throughput or GPU inference validation.

Evidence: Node documents premature response closure as `aborted` / ECONNRESET and socket timeout as inactivity (https://nodejs.org/docs/latest-v24.x/api/http.html). Hugging Face signed download URLs can expire; request fresh redirects (https://huggingface.co/docs/xet/download-protocol). Actual user/provider logs are not available; these are reproducible implementation weaknesses, not a claim to identify every network bottleneck.
