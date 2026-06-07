# Neo4j Data Migrations

## `migrate-dedup-belongs-to.ts`

This migration cleans stale MacroGraph relationships without loading the full graph into Node.js memory.

Execution order:

1. `deduplicateBelongsTo(userId)`
2. `pruneIncompatibleSubclusterMemberships(userId, undefined, 1000)` in a batch loop until the deleted count reaches `0`
3. Empty cleanup:
   - delete empty `MacroSubcluster` nodes directly with Neo4j Cypher
   - run `removeEmptyClusters(userId)` for empty `MacroCluster` nodes

Dry-run mode is read-only and reports:

- duplicate `BELONGS_TO` node count
- duplicate `BELONGS_TO` relationship count that would be deleted
- incompatible `CONTAINS` / `REPRESENTS` relationship counts that would be deleted
- empty subcluster and cluster cleanup candidates

Commands:

```bash
npm run migrate:neo4j:dedup:dry
npm run migrate:neo4j:dedup
npm run migrate:neo4j:dedup -- --userId=<id>
```

The migration discovers users from `MacroGraph.userId` unless `--userId=<id>` is provided. It processes users sequentially and relies on Neo4j-side count/delete queries to avoid materializing graph data in API server memory.
