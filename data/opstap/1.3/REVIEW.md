# Source review: Op.stap 1.3

Reviewed from the official site's loaded catalog on 2026-10-09. Snapshot date: 2026-10-02. Snapshot UUID: `3de366be-c52d-4ef1-9230-f2e7920825ff`. SHA-256 of the downloaded bytes is recorded in `manifest.json`.

## Browser observations

The official webcomponent loads the snapshot list, the selected snapshot's hash, and its complete `krcItems` JSON. Selecting Wiskunde → Getallenkennis → Positieve rationale getallen and group 3de leerjaar/G introduced no new catalog network request. The seven route descriptions and 32 route-specific groups in the popup match the reference-frame records in the payload.

Compared browser-rendered goals `2.1.GL3.19` through `2.1.GL3.29` with their source records. In particular `2.1.GL3.28` renders a horizontal 3/4 fraction; the original MathML is preserved, and the derived plain text represents it as `(3)/(4)`. Its official wording and clarification are not merged.

## Structural review

- 15,290 records; 7,488 unique official goal codes and source UUIDs.
- 13 disciplines, 65 domains, 220 subdomains, 477 clusters.
- 854 local route containers, 6,131 local group containers.
- Seven global routes and 32 global route-specific groups.
- 4,607 nonempty topic/group search entries across four hierarchy levels.
- Every parent/child relationship resolves bidirectionally; no cycles or unresolved internal references.
- Every goal's hierarchy and global age-group reference agree with its local parent chain and route/group themes.
- Every goal relationship resolves to a goal. Categories: together, alternative, after, before, mandatoryTogether.
- 2,510 goals have no cluster in the source. This is preserved as an optional field, not repaired with an invented classification.
- Blank local containers are retained in the raw Convex graph, without presenting empty goal sets to teachers.

## Interpretation decisions

Source route labels are G Gemeenschappelijke doelen, P Predoelen, S Specifieke onderwijsbehoeften, + Plusdoelen, A Anderstalige nieuwkomers, Z Gemeenschappelijke zwemdoelen, V Vlaamse gebarentaal. No route-to-year reinterpretation or numerical age mapping was added. Clarification and examples remain explanatory source content. Search grouping is derived from the actual ancestor path; no application topic tags have been asserted as official metadata.

This review checks provenance, structural integrity and exact transfer, not an independent educational rewrite. A future source-format change must be reviewed before publication.
