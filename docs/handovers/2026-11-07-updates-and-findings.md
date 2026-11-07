# November 7 work: preserved implementation and findings

The user requested that today's implementation and conclusions remain on a separate branch and that production return to the application that was live four days earlier. This archive preserves the complete application tree from `a608e56af3aac461c4ce389180cb73935aebb919`, plus this handover. The design is preserved for reconsideration; it was not accepted by the user.

## Preserved changes

- [PR #144](https://github.com/IvanGoranov02/sg-calculator/pull/144), merged as `916e5e36b701c951f3379ae06c610e4f67a95e90`: watchlist and dividend fixes; articles and admin content editing; page copy/media editing; revised light/dark themes; portfolio ledger/history corrections.
- [PR #145](https://github.com/IvanGoranov02/sg-calculator/pull/145), merged as `b52922d57a7d6101a6a3c0e08466860d9edc12dc`: company lookup through public Yahoo search with a current SEC fallback. Local suggestions remain available while live matches load.
- [PR #146](https://github.com/IvanGoranov02/sg-calculator/pull/146), merged as `a608e56af3aac461c4ce389180cb73935aebb919`: black primary actions and active navigation, neutral interaction states, simplified Dashboard header, readable inline links in both themes, and hydration-safe sidebar preference persistence.

## Findings and validation

- The useful design reference is the [Snowball portfolio demo](https://snowball-analytics.com/public/portfolios/dpawdnmreb), rather than only its marketing homepage. Its hierarchy uses restrained surfaces, dark typography and colors that distinguish data series/categories. The latest implementation adapted that hierarchy with black actions at the user's request; the user subsequently requested the rollback.
- Black primary tokens need white labels on filled actions. Inline links must use readable foreground tokens; black primary text becomes hard to read on a dark surface. Search selections should use accent surface/foreground pairs, not translucent black. Financial movement, saved/live status and chart-series colors serve separate purposes.
- Reading sidebar localStorage in a lazy initial state caused server/client disagreement when the stored preference was expanded. The archive fixes this with `useSyncExternalStore`, a stable collapsed server snapshot and subscribed storage/local events. Browser checks covered reload persistence, cross-tab synchronization and the mobile drawer.
- Portfolio history investigation found an order-history quantity-sign problem affecting split/removal events. The preserved parser handles removal signs, and the history uses quantity timelines with actual price and FX data. Account history was inspected read-only; this work did not mutate production portfolio records.
- The broad implementation passed 691 unit tests, TypeScript and production build. Existing lint warnings were recorded separately from errors. The final accent correction passed changed-file ESLint (three pre-existing warnings), TypeScript and a webpack production build.
- After the final deployment, real Dashboard/Watchlist browser checks passed in light/dark themes and at 390px mobile width, including DPZ suggestions, black actions/navigation, neutral selected results, no horizontal overflow, no page errors and no HTTP 5xx responses. Primary action text contrast measured approximately 17.7:1 in light mode and 18.9:1 in dark mode locally.
- The live lookup returned Domino's Pizza as DPZ and SpaceX as SPCX. Do not assume that an older local company index is current; verify listings against current sources before changing lookup behavior.

## Remaining limitations

- The first requested article's source material was not accessible through its Notion attachment metadata. The article infrastructure is preserved, but the actual article text still needs an accessible source URL/page before publication.
- An authenticated visual check of the user's portfolio was not completed in the browser. Read-only history/data checks were performed; those do not substitute for an authenticated UI check.
- Draft audit PRs #135 and #137 remain separate historical work. They were not merged as part of today's changes.
- Notion task comments contain the pre-implementation reviews and deployment evidence. After rollback, previously completed tasks whose implementation exists only here should be treated as archived work, not as features currently available in production.

## Rollback target and data handling

The requested date is November 3, 2026. Git first-parent history and GitHub production deployments agree that the application live then was `a7f3d5434ce01535a14553207a9cfcf8fe57d0e4` ([PR #143](https://github.com/IvanGoranov02/sg-calculator/pull/143)), deployed successfully on October 20 at 13:07 UTC. There was no later production deployment until November 7.

The rollback should restore that application source through a new commit/PR, preserving history. The older application schema predates the additive `Article` and `SiteContent` tables. A rollback build must skip schema application, or explicitly preserve those additive definitions, so that restoring the application does not delete persisted content. The archive includes those models and their migration for future work.
