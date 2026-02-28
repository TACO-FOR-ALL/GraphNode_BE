import { Driver, Session, Transaction } from 'neo4j-driver';
import { GraphNeo4jStore, Neo4jOptions } from '../../core/ports/GraphNeo4jStore';
import { getNeo4jDriver } from '../db/neo4j';
import { GraphNodeDoc, GraphEdgeDoc, GraphClusterDoc, GraphStatsDoc } from '../../core/types/persistence/graph.persistence';
import { 
  MicroscopeEntityNode, 
  MicroscopeChunkNode, 
  MicroscopeRelEdge 
} from '../../core/types/neo4j/microscope.neo4j';
import type { 
  MicroscopeGraphDataDto, 
 
} from '../../shared/dtos/microscope';
import { logger } from '../../shared/utils/logger';
import { UpstreamError } from '../../shared/errors/domain';

export class Neo4jGraphAdapter implements GraphNeo4jStore {
  private getDriver(): Driver {
    return getNeo4jDriver();
  }


  //FIXME TODO -> Neo4j 접근하는 관련 구현체 코드 전부다 수정 요망
  // 추후 AI 서버 코드 및 개발자와의 협의진행 요망

  // Helper to run query with optional transaction
  private async runQuery(query: string, params: any = {}, options?: Neo4jOptions) {
    const session = options?.session as Session | undefined;
    const tx = options?.session as Transaction | undefined;

    if (tx && typeof tx.run === 'function') {
        return await tx.run(query, params);
    }

    const driver = this.getDriver();
    // Default to write mode for upserts, or auto? Neo4j driver handles session types.
    const newSession = driver.session(); 
    try {
      return await newSession.run(query, params);
    } finally {
      await newSession.close();
    }
  }

  // --- Node Methods ---


  async upsertNode(node: GraphNodeDoc, options?: Neo4jOptions): Promise<void> {
    const query = `
      MERGE (n:Node {id: $id, userId: $userId})
      SET n += $props, n.updatedAt = datetime()
    `;
    const props = {
      label: (node as any).label,
      summary: (node as any).summary,
      clusterId: node.clusterId,
      metadata: (node as any).metadata ? JSON.stringify((node as any).metadata) : null,
      timestamp: node.timestamp,
      numMessages: node.numMessages
    };

    try {
        await this.runQuery(query, { id: node.id, userId: node.userId, props }, options);
    } catch (e) {
        throw new UpstreamError('Neo4j upsertNode failed', { cause: e as any });
    }
  }

  async updateNode(userId: string, id: number, patch: Partial<GraphNodeDoc>, options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH (n:Node {id: $id, userId: $userId})
      SET n += $patch, n.updatedAt = datetime()
    `;
    const patchProps: any = { ...patch };
    if ((patch as any).metadata) patchProps.metadata = JSON.stringify((patch as any).metadata); 

    await this.runQuery(query, { id, userId, patch: patchProps }, options);
  }

  async deleteNode(userId: string, id: number, options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH (n:Node {id: $id, userId: $userId})
      DETACH DELETE n
    `;
    await this.runQuery(query, { id, userId }, options);
  }

  async deleteNodes(userId: string, ids: number[], options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH (n:Node)
      WHERE n.userId = $userId AND n.id IN $ids
      DETACH DELETE n
    `;
    await this.runQuery(query, { userId, ids }, options);
  }

  async findNode(userId: string, id: number): Promise<GraphNodeDoc | null> {
    const query = `
      MATCH (n:Node {id: $id, userId: $userId})
      RETURN n
    `;
    const result = await this.runQuery(query, { id, userId });
    if (result.records.length === 0) return null;
    
    const props = result.records[0].get('n').properties;
    return this.mapToGraphNodeDoc(props);
  }

  // --- Edge Methods ---

  async upsertEdge(edge: GraphEdgeDoc, options?: Neo4jOptions): Promise<string> {
    const query = `
      MATCH (s:Node {id: $source, userId: $userId})
      MATCH (t:Node {id: $target, userId: $userId})
      MERGE (s)-[r:RELATED {id: $id}]->(t)
      SET r += $props, r.updatedAt = datetime()
      RETURN r.id as id
    `;
    const props = {
        relation: (edge as any).relation,
        weight: edge.weight,
        type: edge.type,
        intraCluster: edge.intraCluster
    };
    
    const result = await this.runQuery(query, { 
        source: edge.source, 
        target: edge.target, 
        userId: edge.userId, 
        id: edge.id, 
        props 
    }, options);

    if (result.records.length === 0) return edge.id; 
    return result.records[0].get('id');
  }

  async deleteEdgeBetween(userId: string, source: number, target: number, options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH (s:Node {id: $source, userId: $userId})-[r:RELATED]-(t:Node {id: $target, userId: $userId})
      DELETE r
    `;
    await this.runQuery(query, { source, target, userId }, options);
  }

  async deleteEdgesByNodeIds(userId: string, ids: number[], options?: Neo4jOptions): Promise<void> {
    const query = `
        MATCH (n:Node)-[r:RELATED]-()
        WHERE n.userId = $userId AND n.id IN $ids
        DELETE r
    `;
    await this.runQuery(query, { userId, ids }, options);
  }

  // --- Cluster Methods ---

  async upsertCluster(cluster: GraphClusterDoc, options?: Neo4jOptions): Promise<void> {
    const query = `
      MERGE (c:Cluster {id: $id, userId: $userId})
      SET c += $props
    `;
    const props = {
        name: cluster.name,
        summary: (cluster as any).summary,
        description: cluster.description
    };
    await this.runQuery(query, { id: cluster.id, userId: cluster.userId, props }, options);
  }

  async deleteCluster(userId: string, id: string, options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH (c:Cluster {id: $id, userId: $userId})
      DETACH DELETE c
    `;
    await this.runQuery(query, { id, userId }, options);
  }

  async findCluster(userId: string, id: string): Promise<GraphClusterDoc | null> {
      return null; 
  }
  
  async listClusters(userId: string): Promise<GraphClusterDoc[]> {
      return [];
  }

  // --- Stats Methods ---
  
  async saveStats(stats: GraphStatsDoc, options?: Neo4jOptions): Promise<void> {
    const query = `
      MERGE (s:Stats {userId: $userId})
      SET s += $props, s.updatedAt = datetime()
    `;
    const props = {
        nodeCount: stats.nodes,
        edgeCount: stats.edges,
        clusterCount: stats.clusters
    };
    await this.runQuery(query, { userId: stats.userId, props }, options);
  } 

  // --- Mappers ---
  
  private mapToGraphNodeDoc(props: any): GraphNodeDoc {
    return {
      id: props.id, 
      userId: props.userId,
      clusterId: props.clusterId,
      createdAt: new Date().toISOString(), 
      updatedAt: new Date().toISOString(),
      origId: '',
      clusterName: '',
      timestamp: null,
      numMessages: 0
    };
  }


  // --- Microscope RAG (Entity / Chunk / REL) ---

  /**
   * Microscope Entity 노드를 저장하거나 업데이트합니다.
   * 'Entity' 라벨을 기준으로 병합합니다.
   * 
   * @param node Entity 노드 정보 (uuid 포함 필수)
   * @param options Transaction 등의 옵션
   */
  async upsertMicroscopeEntityNode(node: MicroscopeEntityNode, options?: Neo4jOptions): Promise<void> {
    const query = `
      MERGE (n:Entity {name: $props.name, user_id: $props.user_id, group_id: $props.group_id})
      ON CREATE SET n.uuid = $uuid, n += $props, n.created_at = datetime(), n.updated_at = datetime()
      ON MATCH SET n += $props, n.updated_at = datetime()
    `;
    const props = {
      name: node.name,
      types: node.types,
      descriptions: node.descriptions,
      chunk_ids: node.chunk_ids,
      source_ids: node.source_ids,
      user_id: node.user_id,
      group_id: node.group_id,
      // created_at is handled by DB datetime()
    };
    try {
      await this.runQuery(query, { uuid: node.uuid, props }, options);
    } catch (e) {
      throw new UpstreamError('Neo4j upsertMicroscopeEntityNode failed', { cause: e as any });
    }
  }

  /**
   * 고유 식별자(uuid)로 Microscope Entity 노드를 조회합니다.
   * 
   * @param uuid Entity 노드의 고유 식별자
   */
  async findMicroscopeEntityNode(uuid: string, options?: Neo4jOptions): Promise<MicroscopeEntityNode | null> {
    const query = `
      MATCH (n:Entity {uuid: $uuid})
      RETURN n
    `;
    const result = await this.runQuery(query, { uuid }, options);
    if (result.records.length === 0) return null;
    return result.records[0].get('n').properties as MicroscopeEntityNode;
  }

  /**
   * 고유 식별자(uuid)를 기반으로 Microscope Entity 노드 및 연관된 엣지들을 모두 삭제합니다.
   */
  async deleteMicroscopeEntityNode(uuid: string, options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH (n:Entity {uuid: $uuid})
      DETACH DELETE n
    `;
    await this.runQuery(query, { uuid }, options);
  }

  /**
   * Microscope Chunk 노드를 저장하거나 업데이트합니다.
   * 'Chunk' 라벨을 사용합니다.
   */
  async upsertMicroscopeChunkNode(node: MicroscopeChunkNode, options?: Neo4jOptions): Promise<void> {
    const query = `
      MERGE (c:Chunk {uuid: $uuid, user_id: $props.user_id, group_id: $props.group_id})
      ON CREATE SET c += $props, c.created_at = datetime()
      ON MATCH SET c += $props
    `;
    const props = {
      text: node.text,
      source_id: node.source_id,
      chunk_index: node.chunk_index,
      user_id: node.user_id,
      group_id: node.group_id,
      created_at: node.created_at || new Date().toISOString()
    };
    try {
      await this.runQuery(query, { uuid: node.uuid, props }, options);
    } catch (e) {
      throw new UpstreamError('Neo4j upsertMicroscopeChunkNode failed', { cause: e as any });
    }
  }

  /**
   * 고유 식별자(uuid)로 Microscope Chunk 노드를 조회합니다.
   */
  async findMicroscopeChunkNode(uuid: string, options?: Neo4jOptions): Promise<MicroscopeChunkNode | null> {
    const query = `
      MATCH (c:Chunk {uuid: $uuid})
      RETURN c
    `;
    const result = await this.runQuery(query, { uuid }, options);
    if (result.records.length === 0) return null;
    return result.records[0].get('c').properties as MicroscopeChunkNode;
  }

  /**
   * 고유 식별자(uuid)를 기반으로 Microscope Chunk 노드를 엣지와 함께 삭제합니다.
   */
  async deleteMicroscopeChunkNode(uuid: string, options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH (c:Chunk {uuid: $uuid})
      DETACH DELETE c
    `;
    await this.runQuery(query, { uuid }, options);
  }

  /**
   * Microscope Entity 간의 'REL' 관계 엣지를 저장하거나 업데이트합니다.
   */
  async upsertMicroscopeRelEdge(edge: MicroscopeRelEdge, options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH (s:Entity {user_id: $props.user_id, group_id: $props.group_id}) WHERE s.name = $start OR s.uuid = $start
      MATCH (t:Entity {user_id: $props.user_id, group_id: $props.group_id}) WHERE t.name = $target OR t.uuid = $target
      MERGE (s)-[r:REL {type: $props.type, user_id: $props.user_id, group_id: $props.group_id}]->(t)
      ON CREATE SET r.uuid = $uuid, r.weight = $props.weight, r.source_ids = $props.source_ids, r.created_at = datetime(), r.updated_at = datetime()
      ON MATCH SET r.weight = $props.weight, r.source_ids = $props.source_ids, r.updated_at = datetime()
    `;
    const props = {
      type: edge.type,
      weight: edge.weight,
      source_ids: edge.source_ids,
      user_id: edge.user_id,
      group_id: edge.group_id,
      start: edge.start,
      target: edge.target,
      created_at: edge.created_at || new Date().toISOString()
    };
    try {
      await this.runQuery(query, { start: edge.start, target: edge.target, uuid: edge.uuid, props }, options);
    } catch (e) {
      throw new UpstreamError('Neo4j upsertMicroscopeRelEdge failed', { cause: e as any });
    }
  }

  /**
   * Microscope Entity 간의 'REL' 엣지를 삭제합니다.
   */
  async deleteMicroscopeRelEdge(uuid: string, options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH ()-[r:REL {uuid: $uuid}]-()
      DELETE r
    `;
    await this.runQuery(query, { uuid }, options);
  }

  /**
   * Entity가 추출된 원래의 Chunk와의 연결고리('EXTRACTED_FROM' 엣지)를 저장합니다.
   * 
   * @param entityUuid 출처가 된 Entity의 uuid
   * @param chunkUuid 연관된 Chunk의 uuid
   */
  async upsertMicroscopeExtractedFromEdge(entityUuid: string, chunkUuid: string, options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH (e:Entity {uuid: $entityUuid})
      MATCH (c:Chunk {uuid: $chunkUuid})
      MERGE (e)-[r:EXTRACTED_FROM]->(c)
    `;
    try {
      await this.runQuery(query, { entityUuid, chunkUuid }, options);
    } catch (e) {
      throw new UpstreamError('Neo4j upsertMicroscopeExtractedFromEdge failed', { cause: e as any });
    }
  }

  /**
   * Microscope Entity <-> Chunk 간의 'EXTRACTED_FROM' 엣지를 삭제합니다.
   */
  async deleteMicroscopeExtractedFromEdge(entityUuid: string, chunkUuid: string, options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH (e:Entity {uuid: $entityUuid})-[r:EXTRACTED_FROM]->(c:Chunk {uuid: $chunkUuid})
      DELETE r
    `;
    await this.runQuery(query, { entityUuid, chunkUuid }, options);
  }

  /**
   * 해당 워크스페이스(group_id)에 속한 모든 Microscope 데이터를 파기합니다. (Cascade Delete용)
   * Entity와 Chunk 노드를 지우면 연결된 엣지도 함께(DETACH) 삭제됩니다.
   */
  async deleteMicroscopeWorkspaceGraphs(groupId: string, options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH (n {group_id: $groupId})
      DETACH DELETE n
    `;
    await this.runQuery(query, { groupId }, options);
  }

  /**
   * 해당 워크스페이스(group_id)에 속한 모든 Microscope 데이터(노드 및 엣지)를 조회하여 FE 포맷으로 반환합니다.
   */
  async getMicroscopeWorkspaceGraph(groupId: string, options?: Neo4jOptions): Promise<MicroscopeGraphDataDto> {
    const nodesQuery = `
      MATCH (n:Entity {group_id: $groupId})
      RETURN n
    `;
    const edgesQuery = `
      MATCH (s:Entity {group_id: $groupId})-[r:REL {group_id: $groupId}]->(t:Entity {group_id: $groupId})
      RETURN r, s.name as start, t.name as target
    `;

    // //Node/Edge에 대한 Type 정의 필요?
    const nodesResult = await this.runQuery(nodesQuery, { groupId }, options);
    const edgesResult = await this.runQuery(edgesQuery, { groupId }, options);

    // //NodeResult에 대한 Type 정의 필요?
    // const nodes: MicroscopeGraphNodeDto[] = [];
    // nodesResult.records.forEach((record) => {
    //   const props = record.get('n').properties;
    //   nodes.push({
    //     id: props.uuid,
    //     name: props.name,
    //     type: props.types && props.types.length > 0 ? props.types[0] : 'Unknown',
    //     description: props.descriptions && props.descriptions.length > 0 ? props.descriptions[0] : '',
    //     source_chunk_id: props.chunk_ids && props.chunk_ids.length > 0 ? props.chunk_ids[0] : null
    //   });
    // });

    // //EdgeResult에 대한 Type 정의 필요?
    // const edges: MicroscopeGraphEdgeDto[] = [];
    // edgesResult.records.forEach((record) => {
    //   const props = record.get('r').properties;
    //   const start = record.get('start');
    //   const target = record.get('target');
    //   edges.push({
    //     id: props.uuid || `edge_${Math.random().toString(36).substr(2, 9)}`,
    //     start: start,
    //     target: target,
    //     type: props.type,
    //     description: props.description || props.type || '',
    //     evidence: props.evidence || '',
    //     confidence: props.weight || 1.0
    //   });
    // });

    return { nodes: [], edges: [] };
  }
}

