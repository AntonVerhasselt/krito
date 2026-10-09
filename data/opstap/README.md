# Op.stap source data

Source: https://opstap.katholiekonderwijs.vlaanderen/ (Katholiek Onderwijs Vlaanderen).

The user confirmed permission from the source owner to scrape the complete catalog for this MVP. Commercial use is to be discussed with the owner later. The repository's MIT license applies to Krito's application code, **not to this third-party curriculum content**. Source content remains attributed to its owner.

Each version directory contains the untouched downloaded `source.json`, the official snapshot listing, a checksum/count manifest, and `goals.json` with normalized goals and searchable topic/group combinations. The source archive retains every record and every field, including empty hierarchy nodes, routes, groups, clarification markup, goal relationships and external minimum-goal references. Full source records and top-level source metadata are also stored in Convex; the archive is for provenance and repeatable validation, not the app's runtime data source.

## Refresh the development catalog

Use the pinned Node runtime and authenticated Convex CLI:

```bash
mise exec node@24.21.0 -- npm run goals:update
```

This fetches the latest snapshot from the URLs observed in the official site's browser network activity, validates and archives it, imports all records using authenticated **internal** Convex functions, verifies each persisted batch, and atomically publishes the completed version. It never deploys backend code or targets production. During an import the previous published catalog remains available. Interrupted imports can be resumed by rerunning the same command.

Individual stages:

```bash
npm run goals:fetch
npm run goals:validate -- --file data/opstap/1.3/goals.json
npm run goals:seed -- --env dev --file data/opstap/1.3/goals.json
```

`goals:fetch -- --version 1.3` selects a version actually listed by the source. Versions are sorted numerically. Importing a historical version never moves the current catalog pointer backwards. An identical published import is a no-op. Changed source or normalized content inside an existing version fails rather than overwriting official wording. A schema change or newly unknown route also fails and needs review of the converter.

No source content is rewritten. `wording` and `clarification` retain the original strings/markup separately. Their text companions are derived for search and model input; MathML fractions retain a slash and exponents retain their structure. The UI renders only an allowlist of harmless formatting/MathML tags and no source scripts, URLs, event handlers or styles.

## Convex structure

- `catalogs`: immutable version metadata, all source top-level metadata, source/dataset SHA-256, counts, routes, groups and publication state.
- `catalogItems`: **all** original source records, keyed by version and source UUID; indexes on type and parent support graph traversal.
- `goals`: official goal code + exact wording, separate clarification, hierarchy, route-specific group, relationships and minimum-goal references. Unique import semantics on `[catalogVersion, goalId]`.
- `goalSets`: materialized topic × source group combinations at discipline/domain/subdomain/cluster level, descendant goal membership and group tags. Empty taxonomy nodes remain in `catalogItems` but do not create selectable empty goal sets.
- `catalogImportBatches`: resumable batch ledger and persisted-data verification.
- `catalogPointers`: current published version, changed only after every expected record is imported and verified.

Full-text indexes search topic paths, group/route labels, goal codes, goal wording and clarification. Queries use Convex indexes rather than shipping the source archive to the browser. Search is case/diacritic insensitive and supports the final-word prefix matching documented by Convex. It does not currently implement typo correction, stemming or semantic synonyms. Official codes also have an exact-match lookup that leads to their subdomain. Recognized source group/route labels constrain the result set; remaining search words must match (the final word can be a prefix). Public queries return published data only.

A phase is not a school year. Groups use the source UUID **and route identity**, so `L3/G` and `L3/+`, or `F3/P` and `F3/V`, remain different groups. No numeric ages or extra official classifications have been inferred. The teacher-facing search returns only subdomains, with their subject/domain context, group/route tags and goal counts. Selecting one subdomain includes its complete goal set automatically. A read-only preview shows the scope. This topic selection persists in session storage while searching; a catalog version change is explicitly explained before replacing it. The remaining hierarchy levels stay in Convex.
