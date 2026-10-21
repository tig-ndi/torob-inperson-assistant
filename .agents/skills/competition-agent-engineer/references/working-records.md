# Lightweight working records

Use the project's existing documents or tracker. These are field suggestions, not mandatory new files. Keep one maintained record rather than copying it into every agent prompt.

## Challenge brief

```text
Official source/version and reviewed date:
Assigned challenge and owner:
User/problem and successful journey:
Hard requirements / disqualifiers:
Deadline + timezone / final handoff reserve:
Approved tools, data, resources and budget:

Criterion | Weight (or unknown) | Observable acceptance | Evidence needed | State

Chosen approach and reason:
Main alternative and why deferred:
Out of scope:
Material unknowns and next resolving check:
Next smallest real vertical slice:
```

If weights are unknown, preserve that fact. Use plausible impact and hard-gate risk to prioritize; do not import another competition's rubric. Distinguish a completed registration form from an activated provider, and an existing API from a validated integration.

## Runtime and evidence snapshot

```text
Candidate revision/configuration:
Source/data version:
Real provider/tool/host paths exercised:
Model requests / tool calls / repair / time / input-output limits:
Terminal outcomes and required artifacts:
Commands and results (pass/fail/skip):
Semantic cases and oracle:
Simulated or unconfirmed boundaries:
Highest-impact remaining failure:
Next action / owner / exit condition:
```

## Fresh-review handoff

```text
Owner -> reviewer; candidate revision:
Setup/run commands and required non-secret configuration:
Official task and rubric source:
Working journey and current evidence:
Known failures and reproduction inputs:
Protected/concurrently edited files:
Remaining time, delivery reserve, and safe change scope:
Return: severity, reproduction, first broken boundary, proposed fix, regression, residual risk.
```

Begin review from a reproducible revision and the task, with a fresh input. A project swap should produce independent evidence, not only another reading of the author's demo script.

Triage first by hard gate and impact on actual judged behavior. Coordinate ownership before changes. Fix a reproduced defect with a focused regression; preserve a known-good candidate. Cut optional scope when validation and delivery no longer fit. When a proposed change is too risky, report a concrete limitation or safer fallback instead of rushing an untested rewrite.

## Delivery check

Use the current official submission contract: required repository/revision, deployed URL and readiness, test access, data/config availability, video format/duration, and deadline. Check links from the judge's access perspective. Keep a truthful backup demo when permitted. Do not submit or publish without the user's applicable authorization.

Report the result in one compact update: behavior delivered, rubric evidence, revision, checks, real/simulated boundaries, unresolved blocker or risk, and next action. A feature is not complete merely because its implementation exists or a tool printed a success message.
