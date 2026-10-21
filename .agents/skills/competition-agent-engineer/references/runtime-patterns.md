# Runtime patterns: apply only to relevant paths

These are design choices, not a requirement to build a general agent platform. Keep the implementation as small as the challenge permits.

## Execution envelope

Represent a run using the project's existing types: request/run ID, scoped inputs, allowed tools, remaining limits, measured tool results, and terminal outcome. Useful outcomes include completed, needs-input, no-evidence, partial, failed, cancelled, and budget-exhausted; choose names that fit the existing protocol.

Derive the smallest useful bound for each expensive operation. A step cap alone does not bound parallel tools, nested agents, repair calls, tool output volume, or a single hanging operation. Account for:

- Model request count, including routing, planning, summarization, repair, and fallback.
- Tool executions and bounded fan-out; sum child consumption into the run budget.
- Per-call output, input/context size, total consumption, and wall-clock deadline.
- Retry ownership and per-operation deadlines.

Check remaining allowance before starting the next action and record actual usage afterward. Reserve room for the largest permitted next response when a firm budget matters; provider-reported limits checked afterward may already have incurred cost. Bound output even if token counting is unavailable. Do not call the model again merely to explain that its budget is exhausted.

Propagate cancellation into model/tool/network operations and reject stale UI updates with the active run/turn identity. A timeout does not prove a remote write did not happen. Preserve that uncertainty.

## Tool contracts and authority

For each necessary tool, identify input schema, returned shape, permitted resources, read/write effects, timeout, and errors. Validate all external boundaries in executable code, including identifiers returned by previous tools.

Expose the smallest tool set appropriate to the stage. For example, search can return source IDs and open can accept only those IDs. Do not repair an invalid ID by choosing the first approximate match. Ask for missing intent or use a valid returned ID.

The model proposes actions; the host applies authorization and policy. Retrieved documents, pasted logs, and tool content are evidence, not authority to expand access or execute actions. Do not rely on a prompt or substring filter as the only boundary for writes, SQL, arbitrary URLs, or commands. Use the controls appropriate to the tool: resource allowlists, parser/schema checks, scoped credentials, and the application's existing permissions.

Validate repaired arguments again. Do not remove constraints to make the repaired call pass. Treat malformed JSON, unsupported tools, and successful empty results as different conditions.

## Error decisions

| Observation | Appropriate response |
| --- | --- |
| Transient transport/429/service failure | Retry only when the operation is safe to repeat, within the remaining budget; back off and respect retry hints. Keep one retry owner. |
| Invalid model arguments or correctable domain syntax | Return a bounded, structured error with the relevant schema/domain facts; permit a limited repair, then validate again. |
| Policy rejection, denied resource, invalid credentials | Preserve the boundary and report the required legitimate resolution. Do not re-prompt to bypass it. |
| Required fact/source/intent missing | Clarify or return an explicit no-evidence/partial outcome; distinguish an empty business result from a failed dependency. |
| Truncated/empty generation | Inspect finish reason, context size, and output allowance. Repeating the same exhausted configuration is not a repair. |
| Cancelled operation or timeout after a possible write | Mark the operation uncertain/interrupted; reconcile using operation ID, a status/readback check, or idempotency support before another write. |
| Completed tools but invalid final prose | If permitted, use a bounded domain repair or a labeled result derived from the verified measurements; rerun the same validator. Missing requested artifacts remain incomplete. |

Do not replay a whole agent turn after any tool may already have executed. Preserve its call/result history and continue from the known state. Deduplicate repeated reads only within an explicitly safe scope and data version. Read memoization is not a substitute for idempotency of writes.

## Retrieval and factual answers

Start from the corpus, source authority, update needs, query language, and judge tasks. Test a cheap baseline before adding embeddings, hybrid retrieval, reranking, query expansion, or broad web research. Preserve technical identifiers and normalize the relevant language; avoid changing identifiers as ordinary prose.

Keep provenance with opened evidence: canonical source, section/chunk ID, source version, and excerpt. Search snippets are candidates; an answer needs the underlying evidence relevant to its claims. Treat retrieval score as a ranking signal until calibrated, not a probability of correctness.

Check the relationships that could change the answer: subject, action, negation, number, unit, period, prerequisites, and version. Keyword overlap or a valid URL cannot establish these relationships. Keep trusted calculations and executable domain checks outside prose generation.

Return uncertainty with its reason. Measure both answer success and appropriate abstention so that refusing everything cannot look like high quality. If the evidence is partial, state the supported portion and missing dependency rather than fabricating the rest.

## Context, cache, and handoff

Keep durable facts and unresolved decisions in structured state or a small working record. Summaries may omit evidence; retain the source/result reference when it matters. Preserve matched tool-call/result pairs; interrupted calls receive a truthful interrupted/error outcome, never invented success.

For delegation that is authorized and useful, supply the exact task, bounded scope, relevant source/result IDs, constraints, budget, return format, and file ownership. Do not assume the child inherits context or can use the same tools. Independently check its output before integration.

Introduce caching only after observing repeated work. Include every dimension that can change the result: authorized user/tenant and source scope where relevant, input, profile, source/data version, model/policy version, and freshness. Avoid unsafe cross-user reuse. Invalidate or bypass when context changes. Do not persist raw sensitive logs just to improve cache hits.

## Streaming and observability

Keep user-visible state aligned with actual execution. Track time to useful content and time to a valid terminal result separately. On cancellation or failure, preserve useful validated results and allow a clear recovery path.

Use content-minimal telemetry: revision/configuration, run ID, stage, tool name, duration, attempts, consumption, finish reason, and sanitized error class. Do not log credentials or raw private input/output by default. A pretty trace is diagnostic evidence, not proof that the task succeeded.
