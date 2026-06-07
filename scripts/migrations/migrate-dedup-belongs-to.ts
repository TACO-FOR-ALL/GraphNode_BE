/**
 * Neo4j MacroGraph cleanup migration.
 *
 * Order:
 *  1. deduplicate BELONGS_TO relationships
 *  2. prune stale CONTAINS/REPRESENTS memberships whose subcluster cluster no longer matches the node cluster
 *  3. remove empty subclusters and clusters
 *
 * Usage:
 *  node dist/scripts/migrations/migrate-dedup-belongs-to.js
 *  node dist/scripts/migrations/migrate-dedup-belongs-to.js --dry-run
 *  node dist/scripts/migrations/migrate-dedup-belongs-to.js --userId=<id>
 */

import neo4j from 'neo4j-driver';

import { closeNeo4j, getNeo4jDriver, initNeo4j } from '../../src/infra/db/neo4j';
import { Neo4jMacroGraphAdapter } from '../../src/infra/graph/Neo4jMacroGraphAdapter';

const PRUNE_BATCH_LIMIT = 1000;

interface IncompatibleMembershipCount {
  containsCount: number;
  representsCount: number;
}

interface EmptyCleanupCount {
  subclusterCount: number;
  clusterCount: number;
}

interface MigrationResult {
  userId: string;
  success: boolean;
  duplicateNodeCount?: number;
  excessBelongsToCount?: number;
  incompatibleContainsCount?: number;
  incompatibleRepresentsCount?: number;
  prunedContainsCount?: number;
  prunedRepresentsCount?: number;
  emptySubclusterCount?: number;
  emptyClusterCount?: number;
  emptySubclustersDeleted?: number;
  emptyClustersDeleted?: number;
  pruneBatches?: number;
  error?: string;
  durationMs: number;
}

function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber(): number }).toNumber();
  }
  return Number(value);
}

async function listUserIds(): Promise<string[]> {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const result = await session.run(
      'MATCH (g:MacroGraph) WHERE g.userId IS NOT NULL RETURN g.userId AS userId ORDER BY userId'
    );
    return result.records.map((record) => String(record.get('userId'))).filter(Boolean);
  } finally {
    await session.close();
  }
}

async function countIncompatibleSubclusterMemberships(
  userId: string
): Promise<IncompatibleMembershipCount> {
  const driver = getNeo4jDriver();
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(
      `
        MATCH (g:MacroGraph {userId: $userId})-[:HAS_NODE]->(n:MacroNode {userId: $userId})
        MATCH (n)-[:BELONGS_TO]->(candidateCluster:MacroCluster {userId: $userId})
        WITH n, candidateCluster
        ORDER BY toInteger(split(candidateCluster.id, '_')[1]) DESC
        WITH n, collect(candidateCluster.id)[0] AS keptClusterId
        MATCH (subclusterCluster:MacroCluster {userId: $userId})-[:HAS_SUBCLUSTER]->(:MacroSubcluster {userId: $userId})-[rel:CONTAINS|REPRESENTS]->(n)
        WHERE subclusterCluster.id <> keptClusterId
        WITH DISTINCT rel, type(rel) AS relType
        RETURN
          count(CASE WHEN relType = 'CONTAINS' THEN 1 END) AS containsCount,
          count(CASE WHEN relType = 'REPRESENTS' THEN 1 END) AS representsCount
      `,
      { userId }
    );
    const record = result.records[0];
    return {
      containsCount: toNumber(record?.get('containsCount')),
      representsCount: toNumber(record?.get('representsCount')),
    };
  } finally {
    await session.close();
  }
}

async function countEmptyCleanupTargets(userId: string): Promise<EmptyCleanupCount> {
  const driver = getNeo4jDriver();
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(
      `
        MATCH (g:MacroGraph {userId: $userId})
        CALL {
          WITH g
          MATCH (g)-[:HAS_CLUSTER]->(emptyCluster:MacroCluster {userId: $userId})
          WHERE NOT (emptyCluster)<-[:BELONGS_TO]-(:MacroNode {userId: $userId})
          RETURN count(DISTINCT emptyCluster) AS clusterCount
        }
        CALL {
          WITH g
          MATCH (g)-[:HAS_CLUSTER]->(:MacroCluster {userId: $userId})-[:HAS_SUBCLUSTER]->(emptySubcluster:MacroSubcluster {userId: $userId})
          WHERE NOT (emptySubcluster)-[:CONTAINS|REPRESENTS]->(:MacroNode {userId: $userId})
          RETURN count(DISTINCT emptySubcluster) AS subclusterCount
        }
        RETURN subclusterCount, clusterCount
      `,
      { userId }
    );
    const record = result.records[0];
    return {
      subclusterCount: toNumber(record?.get('subclusterCount')),
      clusterCount: toNumber(record?.get('clusterCount')),
    };
  } finally {
    await session.close();
  }
}

async function countExpectedEmptyCleanupTargets(userId: string): Promise<EmptyCleanupCount> {
  const driver = getNeo4jDriver();
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(
      `
        MATCH (g:MacroGraph {userId: $userId})
        CALL {
          WITH g
          MATCH (g)-[:HAS_CLUSTER]->(cluster:MacroCluster {userId: $userId})
          WHERE NOT EXISTS {
            MATCH (g)-[:HAS_NODE]->(n:MacroNode {userId: $userId})-[:BELONGS_TO]->(candidateCluster:MacroCluster {userId: $userId})
            WITH cluster, n, candidateCluster
            ORDER BY toInteger(split(candidateCluster.id, '_')[1]) DESC
            WITH cluster, n, collect(candidateCluster.id)[0] AS keptClusterId
            WHERE keptClusterId = cluster.id
            RETURN 1 AS matched
          }
          RETURN count(DISTINCT cluster) AS clusterCount
        }
        CALL {
          WITH g
          MATCH (g)-[:HAS_CLUSTER]->(subclusterCluster:MacroCluster {userId: $userId})-[:HAS_SUBCLUSTER]->(subcluster:MacroSubcluster {userId: $userId})
          WHERE NOT EXISTS {
            MATCH (subcluster)-[:CONTAINS|REPRESENTS]->(n:MacroNode {userId: $userId})
            OPTIONAL MATCH (n)-[:BELONGS_TO]->(candidateCluster:MacroCluster {userId: $userId})
            WITH subclusterCluster, n, candidateCluster
            ORDER BY toInteger(split(candidateCluster.id, '_')[1]) DESC
            WITH subclusterCluster, n, count(candidateCluster) AS belongsToCount, collect(candidateCluster.id)[0] AS keptClusterId
            WHERE belongsToCount = 0 OR keptClusterId = subclusterCluster.id
            RETURN 1 AS matched
          }
          RETURN count(DISTINCT subcluster) AS subclusterCount
        }
        RETURN subclusterCount, clusterCount
      `,
      { userId }
    );
    const record = result.records[0];
    return {
      subclusterCount: toNumber(record?.get('subclusterCount')),
      clusterCount: toNumber(record?.get('clusterCount')),
    };
  } finally {
    await session.close();
  }
}

async function deleteEmptySubclusters(userId: string): Promise<number> {
  const driver = getNeo4jDriver();
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const result = await session.run(
      `
        MATCH (g:MacroGraph {userId: $userId})-[:HAS_CLUSTER]->(:MacroCluster {userId: $userId})-[:HAS_SUBCLUSTER]->(sc:MacroSubcluster {userId: $userId})
        WHERE NOT (sc)-[:CONTAINS|REPRESENTS]->(:MacroNode {userId: $userId})
        WITH collect(DISTINCT sc) AS subclusters
        FOREACH (sc IN subclusters | DETACH DELETE sc)
        RETURN size(subclusters) AS deleted
      `,
      { userId }
    );
    return toNumber(result.records[0]?.get('deleted'));
  } finally {
    await session.close();
  }
}

async function runPruneBatchLoop(
  adapter: Neo4jMacroGraphAdapter,
  userId: string
): Promise<{ containsDeleted: number; representsDeleted: number; batches: number }> {
  let containsDeleted = 0;
  let representsDeleted = 0;
  let batches = 0;

  while (true) {
    const batch = await adapter.pruneIncompatibleSubclusterMemberships(
      userId,
      undefined,
      PRUNE_BATCH_LIMIT
    );
    const batchDeleted = batch.containsDeleted + batch.representsDeleted;
    if (batchDeleted === 0) break;

    containsDeleted += batch.containsDeleted;
    representsDeleted += batch.representsDeleted;
    batches += 1;
  }

  return { containsDeleted, representsDeleted, batches };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const singleUser = args.find((arg) => arg.startsWith('--userId='))?.split('=')[1];

  console.log('========================================================');
  console.log('  Neo4j MacroGraph Cleanup Migration');
  console.log('========================================================');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (read-only)' : 'APPLY'}`);
  console.log(`Prune batch limit: ${PRUNE_BATCH_LIMIT}`);
  console.log(`Neo4j URI: ${process.env['NEO4J_URI'] ?? '(env unset)'}`);
  console.log('');

  try {
    await initNeo4j();
    console.log('[Neo4j] connected');
  } catch (err) {
    console.error('[Neo4j] connection failed:', err);
    process.exit(1);
  }

  const adapter = new Neo4jMacroGraphAdapter();
  const userIds = singleUser ? [singleUser] : await listUserIds();

  console.log(
    singleUser
      ? `Target users: single user ${singleUser}`
      : `Target users: discovered ${userIds.length} user(s)`
  );

  if (userIds.length === 0) {
    console.log('No target users. Exiting.');
    await closeNeo4j();
    return;
  }

  console.log('');

  const results: MigrationResult[] = [];

  for (const userId of userIds) {
    const startMs = Date.now();
    const shortId = userId.slice(0, 8);
    console.log(`[${shortId}...] start`);

    try {
      const { duplicateNodeCount, excessRelCount } =
        await adapter.countDuplicateBelongsTo(userId);

      if (isDryRun) {
        const incompatible = await countIncompatibleSubclusterMemberships(userId);
        const emptyCleanup = await countExpectedEmptyCleanupTargets(userId);
        const durationMs = Date.now() - startMs;

        console.log(`  duplicate BELONGS_TO nodes: ${duplicateNodeCount}`);
        console.log(`  duplicate BELONGS_TO rels to delete: ${excessRelCount}`);
        console.log(
          `  incompatible memberships to delete: CONTAINS=${incompatible.containsCount}, REPRESENTS=${incompatible.representsCount}`
        );
        console.log(
          `  empty cleanup candidates: subclusters=${emptyCleanup.subclusterCount}, clusters=${emptyCleanup.clusterCount}`
        );
        console.log(`  done (${durationMs}ms)`);

        results.push({
          userId,
          success: true,
          duplicateNodeCount,
          excessBelongsToCount: excessRelCount,
          incompatibleContainsCount: incompatible.containsCount,
          incompatibleRepresentsCount: incompatible.representsCount,
          emptySubclusterCount: emptyCleanup.subclusterCount,
          emptyClusterCount: emptyCleanup.clusterCount,
          durationMs,
        });
      } else {
        await adapter.deduplicateBelongsTo(userId);

        const pruneResult = await runPruneBatchLoop(adapter, userId);

        const preClusterCleanup = await countEmptyCleanupTargets(userId);
        const emptySubclustersDeleted = await deleteEmptySubclusters(userId);
        await adapter.removeEmptyClusters(userId);
        const postClusterCleanup = await countEmptyCleanupTargets(userId);
        const emptyClustersDeleted = Math.max(
          0,
          preClusterCleanup.clusterCount - postClusterCleanup.clusterCount
        );

        const durationMs = Date.now() - startMs;
        console.log(`  duplicate BELONGS_TO rels deleted: ${excessRelCount}`);
        console.log(
          `  incompatible memberships deleted: CONTAINS=${pruneResult.containsDeleted}, REPRESENTS=${pruneResult.representsDeleted}, batches=${pruneResult.batches}`
        );
        console.log(
          `  empty cleanup deleted: subclusters=${emptySubclustersDeleted}, clusters=${emptyClustersDeleted}`
        );
        console.log(`  done (${durationMs}ms)`);

        results.push({
          userId,
          success: true,
          duplicateNodeCount,
          excessBelongsToCount: excessRelCount,
          prunedContainsCount: pruneResult.containsDeleted,
          prunedRepresentsCount: pruneResult.representsDeleted,
          emptySubclustersDeleted,
          emptyClustersDeleted,
          pruneBatches: pruneResult.batches,
          durationMs,
        });
      }
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`  failed: ${errorMessage}`);
      results.push({ userId, success: false, error: errorMessage, durationMs });
    }
  }

  console.log('');
  console.log('========================================================');
  console.log('  Migration Summary');
  console.log('========================================================');

  const successes = results.filter((result) => result.success);
  const failures = results.filter((result) => !result.success);

  console.log(`Success: ${successes.length} user(s) / Failure: ${failures.length} user(s)`);
  console.log('');

  if (isDryRun) {
    const duplicateNodes = successes.reduce((sum, result) => sum + (result.duplicateNodeCount ?? 0), 0);
    const duplicateBelongsTo = successes.reduce(
      (sum, result) => sum + (result.excessBelongsToCount ?? 0),
      0
    );
    const incompatibleContains = successes.reduce(
      (sum, result) => sum + (result.incompatibleContainsCount ?? 0),
      0
    );
    const incompatibleRepresents = successes.reduce(
      (sum, result) => sum + (result.incompatibleRepresentsCount ?? 0),
      0
    );
    const emptySubclusters = successes.reduce(
      (sum, result) => sum + (result.emptySubclusterCount ?? 0),
      0
    );
    const emptyClusters = successes.reduce((sum, result) => sum + (result.emptyClusterCount ?? 0), 0);

    console.log('[DRY RUN]');
    console.log(`  duplicate BELONGS_TO nodes: ${duplicateNodes}`);
    console.log(`  duplicate BELONGS_TO rels to delete: ${duplicateBelongsTo}`);
    console.log(
      `  incompatible CONTAINS/REPRESENTS to delete: CONTAINS=${incompatibleContains}, REPRESENTS=${incompatibleRepresents}, total=${incompatibleContains + incompatibleRepresents}`
    );
    console.log(
      `  empty cleanup candidates: subclusters=${emptySubclusters}, clusters=${emptyClusters}`
    );
    console.log('');
    console.log('Remove --dry-run to apply the cleanup.');
  } else {
    const duplicateBelongsTo = successes.reduce(
      (sum, result) => sum + (result.excessBelongsToCount ?? 0),
      0
    );
    const prunedContains = successes.reduce(
      (sum, result) => sum + (result.prunedContainsCount ?? 0),
      0
    );
    const prunedRepresents = successes.reduce(
      (sum, result) => sum + (result.prunedRepresentsCount ?? 0),
      0
    );
    const emptySubclustersDeleted = successes.reduce(
      (sum, result) => sum + (result.emptySubclustersDeleted ?? 0),
      0
    );
    const pruneBatches = successes.reduce((sum, result) => sum + (result.pruneBatches ?? 0), 0);

    console.log('[APPLY]');
    console.log(`  duplicate BELONGS_TO rels deleted: ${duplicateBelongsTo}`);
    console.log(
      `  incompatible CONTAINS/REPRESENTS deleted: CONTAINS=${prunedContains}, REPRESENTS=${prunedRepresents}, total=${prunedContains + prunedRepresents}`
    );
    console.log(`  prune batches: ${pruneBatches}`);
    console.log(`  empty subclusters deleted: ${emptySubclustersDeleted}`);
    console.log(
      `  empty clusters deleted: ${successes.reduce(
        (sum, result) => sum + (result.emptyClustersDeleted ?? 0),
        0
      )}`
    );
    console.log('');
    console.log('User details:');
    for (const result of results) {
      const marker = result.success ? 'OK' : 'FAIL';
      const detail = result.success
        ? `BELONGS_TO=${result.excessBelongsToCount ?? 0}, CONTAINS=${result.prunedContainsCount ?? 0}, REPRESENTS=${result.prunedRepresentsCount ?? 0}, emptySubclusters=${result.emptySubclustersDeleted ?? 0}, ${result.durationMs}ms`
        : `ERROR: ${result.error} (${result.durationMs}ms)`;
      console.log(`  ${marker} ${result.userId.slice(0, 8)}... ${detail}`);
    }
  }

  if (failures.length > 0) {
    console.log('');
    console.log('Retry failed users with:');
    failures.forEach((result) => console.log(`  --userId=${result.userId}`));
  }

  await closeNeo4j();
  console.log('');
  console.log('[done] Neo4j connection closed');

  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
