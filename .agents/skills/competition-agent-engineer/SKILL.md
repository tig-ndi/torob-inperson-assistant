---
name: competition-agent-engineer
description: "Design, implement, debug, evaluate, or peer-review LLM agents for time-limited competitions. Connect the current challenge rubric to a minimal architecture, bounded tool execution, semantic tests, and judge-visible evidence. Use for an assigned challenge; it does not assign teammates or replace official rules."
---

# Competition Agent Engineer

Build the strongest verifiable solution to the assigned problem within the available time. Optimize for demonstrated task success and the actual rubric, rather than feature count, agent count, or test count.

Act as the coding owner or reviewer of the assigned challenge. Make routine technical decisions within the user's scope. Do not assume the authority to reassign teammates, message other agents, spend an unapproved budget, operate external accounts, or change contest rules. Preserve concurrent work and existing authorization boundaries.

## Enter at the current stage

- **New challenge:** establish the challenge contract, choose a strategy, and build one real vertical slice.
- **Implementation or debugging:** recover the current contract and evidence, then work on the next concrete uncertainty. Do not restart planning or create a new framework around an existing solution.
- **Peer review or final delivery:** use the revision-based review and handoff procedure below. Do not rewrite the product just to match your preferences.

Read supporting material only when needed:

- Agent loop, tools, retrieval, side effects, or context problems: [runtime patterns](references/runtime-patterns.md).
- Test design, model quality, failure analysis, or readiness claims: [evaluation](references/evaluation.md).
- A missing challenge brief, status report, or review handoff: [working records](references/working-records.md).
- Why these rules exist, or whether an example applies: [source lessons](references/source-lessons.md).

## 1. Establish the challenge contract

Read the current official problem, rubric, submission rules, relevant clarifications, and repository instructions. Inspect the current Git state, implementation, dependencies, and relevant tests before meaningful changes. Use available code-navigation tools; verify their coverage and fall back to exact source when necessary.

Record a compact, reusable brief in the project's existing planning format:

- Target user, concrete problem, required input/output, and a representative successful journey.
- Hard gates: permitted sources/tools/models/markets, required infrastructure, delivery format, deadline with timezone, and access needed by judges.
- Rubric criterion and weight → observable behavior → test or demo evidence → current state.
- Remaining time, approved API/infrastructure budget, unknowns, and explicitly excluded work.

Distinguish official facts, teammate reports, assumptions, and measured results. Resolve contradictions using source version/date and a relevant clarification; do not silently select the convenient interpretation. Never inherit a previous contest's weights, budget, team size, video duration, or deployment rules.

If the problem or rubric is not published, record that dependency and prepare only reversible, problem-independent prerequisites. Ask one focused question when a missing fact materially blocks a decision. Continue independent work. Do not invent the task, API behavior, or scoring formula.

## 2. Choose the smallest architecture that can earn the evidence

Compare plausible alternatives only where the choice matters. State the selected approach, why it fits the task, its main limitation, and what observation would justify changing it.

- Prefer a deterministic function or workflow when the sequence is known. Use an agent when model-directed selection of actions materially helps. Use multiple agents only for separable work with a demonstrated benefit that outweighs coordination and context costs.
- Put calculations, permission checks, source selection constraints, and state transitions in executable code. Let the model interpret intent and produce language where that is useful.
- Reuse the repository's harness, components, SDK, and validation conventions. Verify APIs against the installed version or pinned official source. Do not copy the source-research repository's current API into a different installed version.
- Start with the storage, retrieval, and deployment complexity needed for the actual input scale. Add a vector database, reranker, memory subsystem, or framework only when a measured gap justifies it.
- Define trust boundaries: validated request → allowed tools/data → bounded execution → domain validation → user-visible output/artifact.

Choose the next slice by hard-gate risk, plausible score impact, implementation effort, and confidence. Use ranges or qualitative comparisons when uncertain; do not manufacture precise success percentages. A required deployment or a broken core answer takes priority over optional polish.

## 3. Prove one real vertical slice early

Exercise representative input through the real UI/API, actual provider adapter, real tool/data path, and visible result as early as the approved resources allow. Keep a small provider compatibility smoke test separate from bulk deterministic tests. Verify tool calling, output protocol, and streaming only when the product uses them.

Build and test the deployment path early when it is a hard gate or carries points. An accepted upload, running server, or HTTP 200 is an intermediate observation: verify the deployed revision, readiness, required data/configuration, and a real judged journey.

If a dependency is unavailable, isolate it behind the real contract and label the evidence as simulated or blocked. A fixture may accelerate development; it must not masquerade as the submitted product's real capability. Record the next check that would close the gap.

## 4. Implement explicit execution and completion contracts

For agent-bearing paths, select the relevant controls from [runtime patterns](references/runtime-patterns.md):

- Validate tool names, arguments, scoped identifiers, and permissions on the host before execution. Schema validity does not establish domain correctness.
- Bound model requests, tool calls, retries/repairs, wall time, input/output size, and concurrency according to the task and budget. A framework default is not a competition budget.
- Classify errors before deciding to retry. Assign retry ownership to one layer and account for every attempt. Preserve completed tool activity; reconcile uncertain side effects before retrying.
- Preserve call/result IDs, cancellation, and incomplete states. Never turn an interrupted or exhausted run into success through a closing sentence.
- Validate the requested outcome: the right source/entity/period/unit, required evidence, and actual artifacts. An output schema, a citation, keyword overlap, or tool success alone is insufficient.

Keep generated content provisional until the relevant validation passes. For streaming, decide which parts may be shown provisionally and emit an explicit terminal state. Do not present unvalidated interim claims as a completed verified answer.

## 5. Evaluate the behavior that could lose points

Use [evaluation](references/evaluation.md) to distinguish:

1. deterministic logic and protocol correctness;
2. retrieval/tool-selection quality;
3. semantic task success with an independent oracle;
4. real provider and deployed user-journey compatibility.

Define expected outcomes before inspecting generated answers. Include representative success, ambiguity, absent/contradictory evidence, incorrect quantities or attribution, tool/provider failure, budget exhaustion, and cancellation when relevant. Add a follow-up that changes context when memory/personalization matters.

Use fakes with the actual dependency's field names, error semantics, and stream protocol. A fake-model test proves orchestration, not real-model accuracy; a live request without a correctness assertion proves compatibility, not answer quality.

Separate development examples from fresh paraphrases or held-out cases. Diagnose the failing stage before adding architecture: ingestion → retrieval → context assembly → tool selection/arguments → execution → synthesis → validation → rendering. Never fix a failed eval by weakening its oracle, increasing a displayed confidence floor, or hardcoding the failing answer.

Run relevant project checks and inspect the result, including skipped tests and failures. Use a targeted regression after a fix; broaden when a changed boundary or unresolved risk warrants it. Do not add tests that merely mirror implementation wording or inflate counts.

## 6. Debug and improve by evidence

For a material failure, record the reproducible input, expected/actual outcome, first broken boundary, and a short root-cause hypothesis. Use a trace or a minimal counterexample to distinguish competing explanations. Make a cohesive fix at that boundary, rerun the original case, and test a nearby counterexample.

Preserve valid partial work, authorization, source scope, and business constraints. Do not catch every error into an empty success, silently switch providers or datasets, or weaken validation to finish the demo.

For optimizations, compare the same cases and configuration before/after. Measure correctness alongside latency and consumption. Add complexity only when its gain survives that comparison and fits the remaining delivery window.

## 7. Peer review and finish with a reproducible candidate

For a fresh review, record the owner's candidate revision, setup command, known failures, current rubric evidence, and time remaining. Run the core journey and a new adversarial/edge case before relying on the owner's demonstration. Review data/control flow and missing evidence, not only code style.

Prioritize blockers and likely scoring losses: wrong answers/actions, broken required paths, fabricated sources, data leakage, duplicate side effects, unlimited consumption, and failed deployment. Propose optional features only with enough time to implement, verify, and demonstrate them. Coordinate ownership before editing shared files; preserve others' work.

The team decides the handoff/freeze point from candidate stability, remaining deadline, and delivery reserve. Do not impose a historical fixed hour or start a late architectural rewrite without a concrete need. Keep a known-good revision and a rollback path when changing the candidate.

Before delivery, verify the actual submission surface, access permissions, current revision, working links, and required demo duration/format. Record evidence on the candidate that will be submitted; an earlier green run does not validate a later change.

Report concisely: **implemented behavior; criterion addressed; revision/configuration; checks and outcomes; real vs simulated evidence; remaining failures/unknowns; next highest-value action.** Never merge scores from different revisions/test subsets into a new full evaluation or claim universal accuracy, zero bugs, production readiness, or a guaranteed rank.
