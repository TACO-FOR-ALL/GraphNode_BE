/**
 * Neo4jGraphAdapter (Deferred)
 *
 * 이 파일은 현재 사용되지 않으며, 빌드 오류 방지를 위해 전체 주석 처리되었습니다.
 * 추후 Neo4j 구현 시 다시 활성화할 예정입니다.
 */

/*
import { Driver, Session, Transaction } from 'neo4j-driver';
import { GraphNeo4jStore, Neo4jOptions } from '../../core/ports/GraphNeo4jStore';
import { getNeo4jDriver } from '../db/neo4j';
import { GraphNodeDoc, GraphEdgeDoc, GraphClusterDoc, GraphStatsDoc } from '../../core/types/persistence/graph.persistence';
import { logger } from '../../shared/utils/logger';
import { UpstreamError } from '../../shared/errors/domain';

export class Neo4jGraphAdapter implements GraphNeo4jStore {
  private getDriver(): Driver {
    return getNeo4jDriver();
  }

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
      // Store other fields if needed, or rely on id/userId
      timestamp: node.timestamp,
      numMessages: node.numMessages
    };

    try {
        await this.runQuery(query, { id: (node as any).id, userId: node.userId, props }, options);
    } catch (e) {
        throw new UpstreamError('Neo4j upsertNode failed', { cause: e as any });
    }
  }

  async updateNode(userId: string, nodeId: number | string, patch: Partial<GraphNodeDoc>, options?: Neo4jOptions): Promise<void> {
    // Note: patch fields might need flattening or JSON serialization like upsert
    // For simplicity, assuming simple fields or manually handled.
    const query = `
      MATCH (n:Node {id: $id, userId: $userId})
      SET n += $patch, n.updatedAt = datetime()
    `;
    const patchProps: any = { ...patch };
    if ((patch as any).metadata) patchProps.metadata = JSON.stringify((patch as any).metadata); 

    await this.runQuery(query, { id: nodeId, userId, patch: patchProps }, options);
  }

  async deleteNode(userId: string, nodeId: number | string, options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH (n:Node {id: $id, userId: $userId})
      DETACH DELETE n
    `;
    await this.runQuery(query, { id: nodeId, userId }, options);
  }

  async deleteNodes(userId: string, nodeIds: (number | string)[], options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH (n:Node)
      WHERE n.userId = $userId AND n.id IN $nodeIds
      DETACH DELETE n
    `;
    await this.runQuery(query, { userId, nodeIds }, options);
  }

  async findNode(userId: string, nodeId: number | string): Promise<GraphNodeDoc | null> {
    const query = `
      MATCH (n:Node {id: $id, userId: $userId})
      RETURN n
    `;
    const result = await this.runQuery(query, { id: nodeId, userId });
    if (result.records.length === 0) return null;
    
    const props = result.records[0].get('n').properties;
    return this.mapToGraphNodeDoc(props);
  }

  // --- Edge Methods ---

  async upsertEdge(edge: GraphEdgeDoc, options?: Neo4jOptions): Promise<string> {
    // Edge in Graph DB connects two nodes.
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
        id: edge._id, 
        props 
    }, options);

    if (result.records.length === 0) return edge._id; 
    return result.records[0].get('id');
  }

  async deleteEdgeBetween(userId: string, source: number | string, target: number | string, options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH (s:Node {id: $source, userId: $userId})-[r:RELATED]-(t:Node {id: $target, userId: $userId})
      DELETE r
    `;
    await this.runQuery(query, { source, target, userId }, options);
  }

  async deleteEdgesByNodeIds(userId: string, nodeIds: (number | string)[], options?: Neo4jOptions): Promise<void> {
    const query = `
        MATCH (n:Node)-[r:RELATED]-()
        WHERE n.userId = $userId AND n.id IN $nodeIds
        DELETE r
    `;
    await this.runQuery(query, { userId, nodeIds }, options);
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
    await this.runQuery(query, { id: cluster.clusterId, userId: cluster.userId, props }, options);
  }

  async deleteCluster(userId: string, clusterId: string, options?: Neo4jOptions): Promise<void> {
    const query = `
      MATCH (c:Cluster {id: $id, userId: $userId})
      DETACH DELETE c
    `;
    await this.runQuery(query, { id: clusterId, userId }, options);
  }

  async findCluster(userId: string, clusterId: string): Promise<GraphClusterDoc | null> {
      // Not typically needed if reading from Mongo, but for completeness
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
        nodeCount: (stats as any).nodeCount || stats.nodes,
        edgeCount: (stats as any).edgeCount || stats.edges,
        clusterCount: (stats as any).clusterCount || stats.clusters
    };
    await this.runQuery(query, { userId: stats.userId, props }, options);
  } 

  // --- Mappers ---
  
  private mapToGraphNodeDoc(props: any): GraphNodeDoc {
    return {
      nodeId: props.id, 
      userId: props.userId,
      clusterId: props.clusterId,
      createdAt: new Date().toISOString(), 
      updatedAt: new Date().toISOString(),
      origId: '',
      clusterName: '',
      timestamp: null,
      numMessages: 0,
      _id: props.id 
    };
  }
}
*/

export {};
