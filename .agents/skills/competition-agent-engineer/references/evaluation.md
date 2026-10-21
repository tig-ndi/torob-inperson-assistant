# Evaluation that distinguishes the sources of confidence

Use the relevant levels below. A passing level does not stand in for another.

| Level | What it proves | What it does not prove |
| --- | --- | --- |
| Deterministic unit/property test | Calculation, parser, schema, state or policy invariant on the supplied cases | Real-model reasoning or provider compatibility |
| Adapter/tool/stream integration with doubles | Components exchange the real contract and handle injected outcomes | Provider availability or semantic accuracy of generated answers |
| Retrieval test on actual indexed content | Needed evidence appears within the available context budget | The model uses that evidence correctly |
| Semantic task eval | Required facts/actions/artifacts match an independent task oracle | General correctness beyond its corpus, model, configuration, and cases |
| Small real-provider smoke | Actual configured model supports the needed protocol | Broad answer quality or a working deployment |
| Deployed journey | Candidate revision works on the required host through the actual UI/API | Universal reliability or production-scale capacity |

## Construct the oracle before generating the answer

For a representative case, record input, relevant context/source, required facts or effects, forbidden mistakes, and acceptable ambiguity/abstention. Assert substance rather than one exact wording. Check the returned artifact or external state when the task requires one; a sentence saying it was created is insufficient.

Examples of useful contrasts:

- Correct port/value vs the same technical words with a wrong port/value.
- Correct customer/source/period vs a valid measurement attributed to another one.
- Current month vs latest available data; currency unit vs a silently assumed conversion.
- A requested forecast/anomaly/report vs a different valid tool result.
- A supported answer vs a fabricated feature whose name is absent from development examples.
- A valid empty result vs dependency failure incorrectly reported as no results.
- A retryable read vs an order/write whose first outcome is uncertain.

For a documentation assistant, use source-backed required facts, prerequisites, forbidden claims, and claim-to-evidence checks. For a data/SQL agent, compare against independent queries or hand-computable fixtures. For an action agent, verify actual allowed state transitions and invariants. Add domain-specific criteria only after reading that challenge.

A model-based grader can assist with language judgments, but calibrate it on manually checked examples, constrain the rubric, and inspect disagreements. Its opinion is not a replacement for deterministic checks on numbers, permissions, and required artifacts.

## Keep test data honest

- Obtain a sanitized fixture from the real adapter contract or official schema. Match actual field names, optional/null cases, errors, and stream terminal events.
- Exercise the real parser/adapter boundary. Do not inject a pre-normalized object past the boundary you intend to validate.
- A scripted model with the expected answer is useful for orchestration, not a semantic benchmark. Label it accordingly.
- Do not choose a gold retrieval chunk and then feed it to the fake model while reporting the result as end-to-end model accuracy.
- Include error assertions. Logging an answer and passing on the absence of exceptions is a smoke check.

## Allocate a small, discriminating case set

Select cases by the rubric and failure cost, not a universal required count. Cover the core journey, a harder variation, genuine ambiguity, missing/conflicting evidence, a misleading near-match, changed follow-up context, and relevant dependency/budget/cancel failures. Keep fresh or held-out cases outside implementation examples.

Run adversarial contrasts through the same public boundary as normal inputs when feasible. Verify that an injected failure really triggered the intended path. Do not count a skipped provider/browser/sandbox test as a pass. Mark partial or fake isolation explicitly.

When a case fails, preserve its input and expected behavior, identify the first broken stage, and add a regression that would have caught it. Keep the oracle stable during the fix; explain any correction to the oracle using the official task or measured source.

## Compare changes and report bounded results

Pin candidate revision, dependency/config/model identity, source/data version, case set, command, and execution conditions. Report passed/failed/skipped counts and the kind of evidence. Record representative failure examples, not just a percentage.

Compare architecture/retrieval/model changes on the same cases and budget. Track task success, appropriate abstention, latency, requests/tool calls, and measured usage. With a small sample, report sample size and observed range; avoid persuasive percentile claims the sample cannot support. If prices are unavailable, report usage rather than invented cost.

Keep full-bank and targeted reruns separate. A prior 61/64 plus a later 3/3 is not a newly measured 64/64. A benchmark and a subjective readiness judgment are different statements.

Finish with the most consequential remaining gap and the next feasible check. The aim is enough evidence for the next decision and a reliable submission, not an elaborate evaluation platform that consumes the competition.
