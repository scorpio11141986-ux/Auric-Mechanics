# Auric Mechanics

Public source snapshot of the bounded P3-A local reading experience, October 24, 2026.

The source includes chart calculations, Composite topology, interactive BodyGraph UI, saved-person reading selection, evidence/provenance contracts, deterministic fallback, and the local development reading adapter. Reading depth, familiarity and display expansion remain separate controls. The local LLM route is development-only and uses explicit chart-scoped consent.

## Source boundary

This repository contains code and build configuration. It excludes interpretation corpora (including frozen Gold, R4 and F1–F7 source records), source archives, real-person birth fixtures, personal readings/traces/screenshots, credentials, local user storage, audit bundles and private Git history. Licensed BodyGraph vector geometry and source-integrity hash metadata are included with the third-party notices; they contain no interpretation corpus or personal chart.

The public export has its own initial history. It does not recover an upstream history or replace the complete private project/review record. `PUBLIC_EXPORT_MANIFEST.json` records source hashes and the two public-copy-only sanitizations.

## Required local content

The active application is `technical-integration-source/companion-mobile/`.

This code-only checkout is **not a complete runnable application distribution**. Restore locally authorized private content before typecheck, a full app build or data-dependent tests:

- The content assets imported by `src/content/records.ts`: runtime records, documents, query configuration and their original dataset pin.
- The packed preview catalogue and its receipt imported by `src/reading/catalog.ts`, plus the locally reviewed catalogue for the development adapter.
- The private `src/reading/foundation-candidates.ts` content module, which contains unapproved educational records and is omitted here.

No substitute dataset, dummy interpretations, credentials or content-rights clearance is supplied. Restore matching original pins; do not remove validation or activate withheld material merely to make a build run.

With those private prerequisites available, restore dependencies from the lockfile with `npm ci`. The normal commands are `npm run typecheck`, `npm test`, `npm run web`, and `npm run reading:local` for the explicitly enabled local development preview. The legacy fixed-person proof loader is unavailable in this public copy; the generic saved-person path is retained.

## Verification and review status

The complete private P3-A candidate passed 396 application tests with zero failures and one optional skip; typecheck passed. Four actual Individual/Composite browser cases passed, including three reading depths, evidence, fallback, explicit consent and 320/390/820/1440 layouts. Existing captured responses were reused without new reading-generation calls. Those tests depended on private content and their named evidence is intentionally absent from this public repository; the public subset is not claimed to reproduce the full suite without that content.

Independent reading-quality/security review, owner visual acceptance, physical-device checks, source rights and commercial provider eligibility remain open. Full P3 and public deployment are not authorized by this source upload. No deployment workflow is included.

Third-party licensing notices are preserved in `technical-integration-source/companion-mobile/THIRD_PARTY_NOTICES.md`. This export adds no new license or redistribution permission for omitted content.
