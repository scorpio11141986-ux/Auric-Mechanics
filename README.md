# Auric Mechanics

Public code snapshot of the bounded P3-A reading experience, contextual explanation pilot and local reading reliability controls, October 25, 2026.

The source includes chart calculations, Composite topology, interactive BodyGraph UI, saved-person reading selection, evidence/provenance contracts, deterministic fallback, and the local development reading adapter. Reading depth, familiarity and display expansion remain separate controls. The local LLM route is development-only and uses explicit chart-scoped consent.

## Source boundary

This repository contains code and build configuration. It excludes interpretation corpora (including frozen Gold, R4 and F1–F7 source records), source archives, real-person birth fixtures, personal readings/traces/screenshots, credentials, local user storage, audit bundles and private Git history. Licensed BodyGraph vector geometry and source-integrity hash metadata are included with the third-party notices; they contain no interpretation corpus or personal chart.

The public export has its own initial history. It does not recover an upstream history or replace the complete private project/review record. `PUBLIC_EXPORT_MANIFEST.json` records source hashes and the public-copy transformations.

## Required local content

The active application is `technical-integration-source/companion-mobile/`.

This code-only checkout is **not a complete runnable application distribution**. Restore locally authorized private content before typecheck, a full app build or data-dependent tests:

- The content assets imported by `src/content/records.ts`: runtime records, documents, query configuration and their original dataset pin.
- The packed preview catalogue and its receipt imported by `src/reading/catalog.ts`, plus the locally reviewed catalogue for the development adapter.
- The private `src/reading/foundation-candidates.ts` and `src/reading/context-teaching-content.ts` content modules. Embedded educational drafts and source excerpts are omitted from this public export.

No substitute dataset, dummy interpretations, credentials or content-rights clearance is supplied. Restore matching original pins; do not remove validation or activate withheld material merely to make a build run.

With those private prerequisites available, restore dependencies from the lockfile with `npm ci`. The normal commands are `npm run typecheck`, `npm test`, `npm run web`, and `npm run reading:local` for the explicitly enabled local development preview. The legacy fixed-person proof loader is unavailable in this public copy; the generic saved-person path is retained.

## Verification and review status

The complete private mobile-opening candidate passed 402 application tests with zero failures and one optional skip; typecheck and six new compact-opening regressions passed. Five saved-person Individual/Composite cases passed the complete browser flow, including 30 Quick/Standard/Deep checks at 320/390px, exact supported compact units, chart expansion, evidence, fallback, consent and navigation. All existing outputs were reused unchanged; one separately authorized new example was generated. Named evidence and protected content are intentionally absent from this public repository. The public subset is not claimed to reproduce the full suite without the private prerequisites.

Independent reading-quality/security review, owner visual acceptance, physical-device checks, source rights and commercial provider eligibility remain open. Full P3 and public deployment are not authorized by this source upload. No deployment workflow is included.

Third-party licensing notices are preserved in `technical-integration-source/companion-mobile/THIRD_PARTY_NOTICES.md`. This export adds no new license or redistribution permission for omitted content.

## Source correction reconciliation — October 24, 2026

A read-only reconciliation compared a source-audit correction candidate with the actual current private dataset and its recorded base. It identified 24 missing comparison copyedits, six different proposed editorial fields to preserve, and source metadata that is largely already present. Provider wording, traditional identities and editorial interpretation remain separate. No dataset replacement, interpretation expansion, source approval or application correction was applied.

Fresh private-baseline checks passed: 57 selected existing tests and six detached probes, with one optional private-input skip; typecheck passed. This is a bounded reconciliation, not another full-app audit or an implemented correction candidate. Implementation is pending owner approval of a versioned review-layer plan. The protected report, datasets, source passages and personal evidence remain excluded from this public export. This commit records status only.

## October 25 local context and reliability checkpoint

This update adds reusable model-free structural discovery, a shared contextual explanation UI in Chart/Reading/Knowledge, seven explanation registers and independent familiarity controls. Exact saved-person/revision binding, native chart calculations, deterministic fallback, the previous reader and its consent/claim safeguards remain. Internal-Line/Gate-edge display warnings use explicit angular counterfactuals; internal QA wording is removed from displayed meaning while protected carriers remain private and unchanged.

The existing local ChatGPT adapter now records reported token usage, supports configurable input-byte/output-token limits, propagates cancellation and prevents simultaneous duplicate requests for the same exact packet/model/policy key. Missing counters remain unknown. No API billing route, account allowance estimate, model-setting change or public inference deployment was added.

The verified complete private checkpoint passed 418 of 419 application tests, with zero failures and one optional private-input skip. Typecheck and all 16 new focused regressions passed. The local panel passed 320/390/820/1440 browser checks. Five prior reading cases passed cache-only replay, including 30 phone depth/width checks, with their original model bundles unchanged. No new inference was issued. These private results do not claim a full-suite pass for this intentionally incomplete public checkout.

The finite structural pilot does not provide sufficient Standard/Deep findings for every chart. New symbolic teaching remains internal review material in the omitted private content module; seven independent substantive-source coverage, editorial/security review, owner usability, physical devices, rights and full P3 acceptance remain open. The separate source-audit corrections remain pending. Source publication is not deployment.

Only reusable code/tests are copied from the frozen verified checkpoint. The concurrently active app worktree is neither copied nor modified during this export. Personal proof scripts, reading evidence, datasets and teaching content remain excluded.

Local operator controls: `AURIC_MAX_INPUT_BYTES` defaults to 1,500,000 UTF-8 instruction plus selected-payload bytes; `AURIC_MAX_OUTPUT_TOKENS` defaults to 32,768, including reasoning and visible output. Provider/model limits still apply. These are development controls, not prices or subscription quotas.

Fresh checks on this public checkout passed 13 self-contained OAuth/stream tests and 5 budget/usage/cancellation tests using synthetic fixtures and mocked transports. No provider inference was made; no protected data was restored. Full data-dependent tests and complete typechecking require the private prerequisites described above.
