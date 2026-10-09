# Accepted MVP changes

The user's instructions take precedence over the original specification in `docs/specification.md`.

## Catalog scope and teacher choice (2026-10-09)

- Import the complete current Op.stap snapshot for **all** disciplines, routes and source groups into Convex. Store all source records, hierarchy, relationships and source metadata, as well as normalized goals and browsing records.
- Use the complete JSON observed loading in the official site's browser, with a repeatable fetch/validate/import command. The user confirmed permission from the source owner for this MVP; commercial reuse will be discussed later.
- The teacher uses one search field rather than successive hierarchy/year filters. Search may match a subject, domain, subdomain, goal wording, clarification or code, but **only subdomains** appear as selectable search results.
- Remove the result-type badge because every selectable result is a subdomain. Keep domain/subject context, source group/route tag and the goal count.
- The teacher selects **one subdomain and its source group/route**, not individual goals. Every goal in that precise source selection must be checked automatically. A read-only goal preview may explain the scope.
- Backend draft/submission code must derive the complete goal membership from the published `goalSets` record; it must not accept an arbitrary subset of goal IDs from the browser. Snapshot all of those goals on submission. Group labels retain their source meaning; a phase or swimming group is not inferred to be a school year.

This replaces individual-goal checkbox selection in original step 3 and the selected-ID browser input in later steps. The full catalog hierarchy remains in Convex and is retained for provenance/future use.
