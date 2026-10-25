# Auric Mechanics

Public source snapshot of the bounded P3-A local reading experience and final compact-opening correction, October 24, 2026.

The source includes chart calculations, Composite topology, interactive BodyGraph UI, saved-person reading selection, evidence/provenance contracts, deterministic fallback, and the local development reading adapter. Reading depth, familiarity and display expansion remain separate controls. The local LLM route is development-only and uses explicit chart-scoped consent.

## Source boundary

This repository contains code and build configuration. It excludes interpretation corpora (including frozen Gold, R4 and F1–F7 source records), source archives, real-person birth fixtures, personal readings/traces/screenshots, credentials, local user storage, audit bundles and private Git history. Licensed BodyGraph vector geometry and source-integrity hash metadata are included with the third-party notices; they contain no interpretation corpus or personal chart.

The public export has its own initial history. It does not recover an upstream history or replace the complete private project/review record. `PUBLIC_EXPORT_MANIFEST.json` records source hashes and the public-copy transformations.

## Required local content

The active application is `technical-integration-source/companion-mobile/`.

This code-only checkout is **not a complete runnable application distribution**. Restore locally authorized private content before typecheck, a full app build or data-dependent tests:

- The content assets imported by `src/content/records.ts`: runtime records, documents, query configuration and their original dataset pin.
- The packed preview catalogue and its receipt imported by `src/reading/catalog.ts`, plus the locally reviewed catalogue for the development adapter.
- The private `src/reading/foundation-candidates.ts` content module, which contains unapproved educational records and is omitted here.

No substitute dataset, dummy interpretations, credentials or content-rights clearance is supplied. Restore matching original pins; do not remove validation or activate withheld material merely to make a build run.

With those private prerequisites available, restore dependencies from the lockfile with `npm ci`. The normal commands are `npm run typecheck`, `npm test`, `npm run web`, and `npm run reading:local` for the explicitly enabled local development preview. The legacy fixed-person proof loader is unavailable in this public copy; the generic saved-person path is retained.

## Verification and review status

The complete private mobile-opening candidate passed 402 application tests with zero failures and one optional skip; typecheck and six new compact-opening regressions passed. Five saved-person Individual/Composite cases passed the complete browser flow, including 30 Quick/Standard/Deep checks at 320/390px, exact supported compact units, chart expansion, evidence, fallback, consent and navigation. All existing outputs were reused unchanged; one separately authorized new example was generated. Named evidence and protected content are intentionally absent from this public repository. The public subset is not claimed to reproduce the full suite without the private prerequisites.

Independent reading-quality/security review, owner visual acceptance, physical-device checks, source rights and commercial provider eligibility remain open. Full P3 and public deployment are not authorized by this source upload. No deployment workflow is included.

Third-party licensing notices are preserved in `technical-integration-source/companion-mobile/THIRD_PARTY_NOTICES.md`. This export adds no new license or redistribution permission for omitted content.

## Source correction reconciliation — October 24, 2026

A read-only reconciliation compared a source-audit correction candidate with the actual current private dataset and its recorded base. It identified 24 missing comparison copyedits, six different proposed editorial fields to preserve, and source metadata that is largely already present. Provider wording, traditional identities and editorial interpretation remain separate. No dataset replacement, interpretation expansion, source approval or application correction was applied.

Fresh private-baseline checks passed: 57 selected existing tests and six detached probes, with one optional private-input skip; typecheck passed. This is a bounded reconciliation, not another full-app audit or an implemented correction candidate. Implementation is pending owner approval of a versioned review-layer plan. The protected report, datasets, source passages and personal evidence remain excluded from this public export. This commit records status only.
