/**
 * Microscope ingest Neo4j Cypher 상수 모음.
 *
 * AI 서버 `infra/repositories/neo4j/handler.py` 와 동일한 MERGE 복합키·배열 append 동작을 유지합니다.
 * - Entity: {name, user_id, group_id}
 * - Chunk:  {uuid, user_id, group_id}
 * - REL:      {type, user_id, group_id} (양 끝 Entity는 name 기준)
 */
export const MICROSCOPE_INGEST_CYPHER = {
  /** Chunk 노드 upsert — Chroma 와 동일 uuid 사용 */
  mergeChunk: `
    MERGE (c:Chunk {uuid: $uuid, user_id: $user_id, group_id: $group_id})
    ON CREATE SET c.text = $text, c.source_id = $source_id, c.chunk_index = $chunk_index,
                  c.created_at = datetime()
    ON MATCH SET c.text = $text, c.source_id = $source_id, c.chunk_index = $chunk_index
  `,

  /** Entity 노드 upsert — types/descriptions/source_ids 는 ON MATCH 시 배열 append */
  mergeEntity: `
    MERGE (n:Entity {name: $name, user_id: $user_id, group_id: $group_id})
    ON CREATE SET n.uuid = $uuid, n.created_at = datetime(), n.updated_at = datetime(),
                  n.types = [], n.descriptions = [], n.source_ids = []
    ON MATCH SET n.updated_at = datetime()
    SET n.types = coalesce(n.types, []) + [t IN $types WHERE NOT t IN coalesce(n.types, [])]
    SET n.descriptions = CASE
      WHEN size($description) > 0 AND NOT $description IN coalesce(n.descriptions, [])
      THEN coalesce(n.descriptions, []) + $description
      ELSE coalesce(n.descriptions, [])
    END
    SET n.source_ids = CASE
      WHEN $source_id IS NOT NULL AND NOT $source_id IN coalesce(n.source_ids, [])
      THEN coalesce(n.source_ids, []) + $source_id
      ELSE coalesce(n.source_ids, [])
    END
  `,

  /** Entity(name) ↔ Chunk(uuid) EXTRACTED_FROM 관계 생성 */
  linkEntityToChunk: `
    MATCH (e:Entity {name: $name, user_id: $user_id, group_id: $group_id})
    MATCH (c:Chunk {uuid: $uuid})
    MERGE (e)-[:EXTRACTED_FROM]->(c)
  `,

  /** Entity 간 REL 관계 upsert — source_ids 는 ON MATCH 시 append */
  mergeRelEdge: `
    MERGE (a:Entity {name: $start, user_id: $user_id, group_id: $group_id})
    MERGE (b:Entity {name: $target, user_id: $user_id, group_id: $group_id})
    MERGE (a)-[r:REL {type: $etype, user_id: $user_id, group_id: $group_id}]->(b)
    ON CREATE SET r.uuid = $uuid, r.created_at = datetime(), r.updated_at = datetime(),
                  r.weight = $weight, r.source_ids = []
    ON MATCH SET r.updated_at = datetime()
    SET r.source_ids = CASE
      WHEN $source_id IS NOT NULL AND NOT $source_id IN coalesce(r.source_ids, [])
      THEN coalesce(r.source_ids, []) + $source_id
      ELSE coalesce(r.source_ids, [])
    END
  `,
} as const;
