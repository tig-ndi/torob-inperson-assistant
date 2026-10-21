# Source lessons and transfer boundaries

Reviewed on 2026-10-20. This reference records why the skill makes its decisions; it is not a dependency manifest or a guarantee that these frameworks suit a particular challenge. Use the installed project's documentation for exact APIs. No framework code is bundled here.

## Personal project evidence

### Data Agent — private project, revision `1e070e0b0e4dc9f4458a966a269ed0705529b2b7`

Evidence paths: `src/dataagent/agent/contract.py:8`, `agent/runtime.py:557,795,906`, `agent/completion.py:153`, `validation/validators.py:577`, `tools/unit_tools.py:27`, `tests/test_analysis_contract.py`.

The implementation records requested task/period/calendar/units and required artifacts, checks completed tools against that contract, and uses measured output only when a limited repair cannot produce valid prose. Numeric grounding includes entity and period attribution. The research ran 56 selected contract/grounding tests successfully using offline/scripted models.

**Transfer:** encode the task's semantic obligations and actual completion evidence. Do not report a missing PDF or wrong analysis as success. Keep provenance of measurements and conversions. **Boundary:** these tests and numeric guards do not prove universal reasoning or domain correctness. Do not import the entire runtime into an unrelated challenge.

### Previous Liara project — private project, revision `77ddfd6110bf821e298ac3424691c558800f92f8`

Evidence paths: `src/ai/agent/grounded-agent.ts:100`, `run-assistant.ts:677,951`, `guardrails/technical-validation.ts:175`, `evals/grounded-answer.eval.test.ts:175`, `evals/live-real-agent.eval.ts:88`.

The source uses server-opened evidence, bounded execution, versioned source metadata, and explicit retry ownership. Its lexical validator nevertheless accepts a wrong port (`9999`) when the synthetic source says `5432`; the standalone probe measured `valid=true`. An unsupported sentence without a citation also passed. The research did not reproduce those inputs through the entire endpoint.

The fake-model eval checks orchestration with a supplied answer; the live file logs outputs without semantic assertions. Neither is sufficient to claim real-model answer accuracy. The old contest page showed 280/300 and feedback about answer accuracy, but the submitted revision is unknown: the probe does not prove the historical loss's cause.

**Transfer:** separate provenance, protocol, semantics, and live compatibility. Add meaningful negative oracles rather than lists of known fabricated phrases. **Boundary:** old rubric weights, credit limits, video duration, and team structure are historical, not reusable requirements.

## Public source revisions

### Vercel AI SDK

Revision `8effb1367599ceea85cde05d646d430172ebe6cf`.

- [Agent wrapper](https://github.com/vercel/ai/blob/8effb1367599ceea85cde05d646d430172ebe6cf/packages/ai/src/agent/tool-loop-agent.ts#L28)
- [Parse and revalidate repaired calls](https://github.com/vercel/ai/blob/8effb1367599ceea85cde05d646d430172ebe6cf/packages/ai/src/generate-text/parse-tool-call.ts#L24)
- [Execute, propagate signals and report outcomes](https://github.com/vercel/ai/blob/8effb1367599ceea85cde05d646d430172ebe6cf/packages/ai/src/generate-text/execute-tool-call.ts#L120)
- [Repair test](https://github.com/vercel/ai/blob/8effb1367599ceea85cde05d646d430172ebe6cf/packages/ai/src/generate-text/parse-tool-call.test.ts#L380)

**Transfer:** use a maintained harness where available, validate every repaired call, preserve IDs and cancellation, and choose explicit limits. **Do not copy:** a particular SDK version, a default of 20 steps, or a fixed four-step policy into every task.

### Cline

Revision `0870796e9e0c640408bb87d9503514a83f57d470`.

- [Retry classification and backoff](https://github.com/cline/cline/blob/0870796e9e0c640408bb87d9503514a83f57d470/sdk/packages/agents/src/agent-runtime.ts#L1242)
- [Host approval boundary](https://github.com/cline/cline/blob/0870796e9e0c640408bb87d9503514a83f57d470/sdk/packages/agents/src/agent-runtime.ts#L2503)
- [Do not replay a turn with completed tool activity](https://github.com/cline/cline/blob/0870796e9e0c640408bb87d9503514a83f57d470/sdk/packages/agents/src/agent-runtime.test.ts#L1089)

**Transfer:** one retry owner, preserved execution history, explicit host permissions, and per-turn error state. **Do not copy:** an IDE/plugin architecture or its full recovery machinery. An SDK setting with no limit supplied is not the app's intended budget.

### GPT Researcher

Revision `3582a6841fe7dc801e2a34e34ee408641aea9bce`.

- [Research context, cached work and subqueries](https://github.com/assafelovic/gpt-researcher/blob/3582a6841fe7dc801e2a34e34ee408641aea9bce/gpt_researcher/skills/researcher.py#L298)
- [No report from empty context](https://github.com/assafelovic/gpt-researcher/blob/3582a6841fe7dc801e2a34e34ee408641aea9bce/gpt_researcher/skills/writer.py#L77)
- [Real retriever contract regression](https://github.com/assafelovic/gpt-researcher/blob/3582a6841fe7dc801e2a34e34ee408641aea9bce/tests/test_quick_search_summary_context.py#L1)

The regression documents how a fake `url/content` object masked a production retriever's `href/body` contract. **Transfer:** test real adapter shapes and evidence reaching the prompt; deduplicate safe reads. **Do not copy:** unrestricted research fan-out or a multi-agent report generator for a bounded lookup task.

### Micky

Revision `7e87b61da8cc6712835334846a699a0a38e841d7`.

- [Agent stream and original errors](https://github.com/xmannii/micky/blob/7e87b61da8cc6712835334846a699a0a38e841d7/electron/agent/service.ts#L103)
- [Stale generation guard](https://github.com/xmannii/micky/blob/7e87b61da8cc6712835334846a699a0a38e841d7/electron/conversation/controller.ts#L222)
- [Staged tool availability test](https://github.com/xmannii/micky/blob/7e87b61da8cc6712835334846a699a0a38e841d7/electron/agent/tools.test.ts#L43)

**Transfer:** explicit run state, cancellation, stale-update prevention and a tool set matching the stage. **Do not copy:** voice/Electron infrastructure, persistent personal memory, or this app's automatic/unattended approval settings as a universal policy.

### Local SQL Agent

Revision `7f96790ad01a7c82111d7139d256c379366ee1cb`.

- [Correctable vs policy rejection](https://github.com/alisadeghiaghili/local-sql-agent/blob/7f96790ad01a7c82111d7139d256c379366ee1cb/llm/sql_agent.py#L396)
- [Parser-based guard](https://github.com/alisadeghiaghili/local-sql-agent/blob/7f96790ad01a7c82111d7139d256c379366ee1cb/security/sql_guard.py#L1809)
- [Truncation must not trigger useless retries](https://github.com/alisadeghiaghili/local-sql-agent/blob/7f96790ad01a7c82111d7139d256c379366ee1cb/tests/test_truncated_completion.py#L96)

**Transfer:** error taxonomy, shared repair allowance, scope preservation and enforcement outside the model. **Do not copy:** SQL-specific restrictions to unrelated tools or assume a parser alone makes a live database safe.

### Deep Agents

Revision `0a19eaa31dd448878257739f8d50e42eb17a13b1`.

- [Parent/child state preparation](https://github.com/langchain-ai/deepagents/blob/0a19eaa31dd448878257739f8d50e42eb17a13b1/libs/deepagents/deepagents/middleware/subagents.py#L804)
- [Interrupted call/result repair](https://github.com/langchain-ai/deepagents/blob/0a19eaa31dd448878257739f8d50e42eb17a13b1/libs/deepagents/deepagents/middleware/patch_tool_calls.py#L11)
- [Retention vs summarization budget](https://github.com/langchain-ai/deepagents/blob/0a19eaa31dd448878257739f8d50e42eb17a13b1/libs/deepagents/deepagents/middleware/summarization.py#L548)

**Transfer:** explicit handoff context, durable references, protocol-consistent interrupted outcomes, and bounded summaries. **Do not copy:** the default recursion limit of 9,999, delegation, or filesystem persistence as requirements for every competition agent.

### Pydantic AI

Revision `964407cd2fdd390079d7b1dddec642735af0f46c`.

- [Argument schema plus domain validation](https://github.com/pydantic/pydantic-ai/blob/964407cd2fdd390079d7b1dddec642735af0f46c/pydantic_ai_slim/pydantic_ai/tool_manager.py#L461)
- [Independent output validator](https://github.com/pydantic/pydantic-ai/blob/964407cd2fdd390079d7b1dddec642735af0f46c/pydantic_ai_slim/pydantic_ai/_output.py#L410)
- [Request and consumption limits](https://github.com/pydantic/pydantic-ai/blob/964407cd2fdd390079d7b1dddec642735af0f46c/pydantic_ai_slim/pydantic_ai/usage.py#L588)
- [Failed output repair stops](https://github.com/pydantic/pydantic-ai/blob/964407cd2fdd390079d7b1dddec642735af0f46c/tests/test_agent.py#L13893)

**Transfer:** schema plus domain invariants, bounded output repair and separate request/tool/token limits. **Do not copy:** framework-wide adoption when a smaller existing design suffices. Domain correctness still needs the application's own oracle.

## Strength of evidence

Public repository tests were inspected at the pinned revisions; their full suites were not executed in the source research. Personal-project checks were bounded to the selected 56 offline Data Agent tests and the standalone Liara validator probe. Graph results were checked for recorded coverage gaps; excluded tests/tools and relevant source ranges were read directly. These observations support engineering patterns, not a ranking forecast or universal correctness claim.
