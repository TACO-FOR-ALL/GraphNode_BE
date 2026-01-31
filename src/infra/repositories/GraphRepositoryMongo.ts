import { FindCursor, UpdateResult, WithId } from 'mongodb';

import { GraphDocumentStore, RepoOptions } from '../../core/ports/GraphDocumentStore';
import {
  GraphClusterDoc,
  GraphEdgeDoc,
  GraphNodeDoc,
  GraphStatsDoc,
} from '../../core/types/persistence/graph.persistence';
import { getMongo } from '../db/mongodb';
import { UpstreamError, ValidationError, NotFoundError } from '../../shared/errors/domain';

export class GraphRepositoryMongo implements GraphDocumentStore {
  private db() {
    const mongo = getMongo();
    if (!mongo) throw new Error('Mongo client not initialized');
    return mongo.db();
  }

  private graphNodes_col() {
    return this.db().collection<GraphNodeDoc>('graph_nodes');
  }

  private graphEdges_col() {
    return this.db().collection<GraphEdgeDoc>('graph_edges');
  }

  private graphClusters_col() {
    return this.db().collection<GraphClusterDoc>('graph_clusters');
  }

  private graphStats_col() {
    return this.db().collection<GraphStatsDoc>('graph_stats');
  }


  /**
   * 노드 생성 또는 업데이트 (upsert).
   * id와 userId를 기준으로 문서를 찾아 업데이트하거나 생성합니다.
   * @param node 저장할 노드 문서.
   */
  async upsertNode(node: GraphNodeDoc, options?: RepoOptions): Promise<void> {
    try {
      await this.graphNodes_col().updateOne(
        { id: node.id, userId: node.userId } as any,
        { $set: node },
        { upsert: true, ...options, session: options?.session as any }
      );
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.upsertNode failed', { cause: String(err) });
    }
  }

  /**
   * 기존 그래프 노드의 일부 속성을 갱신합니다.
   * @param userId 사용자 ID
   * @param id 갱신할 노드의 ID (number)
   * @param patch 갱신할 속성 객체
   */
  async updateNode(
    userId: string,
    id: number,
    patch: Partial<GraphNodeDoc>,
    options?: RepoOptions
  ): Promise<void> {
    try {
      const update: Partial<GraphNodeDoc> = {
        ...patch,
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
      };
      const res: UpdateResult<GraphNodeDoc> = await this.graphNodes_col().updateOne(
        { id, userId } as any,
        { $set: update },
        { ...options, session: options?.session as any }
      );
      if (res.matchedCount === 0) throw new NotFoundError('Graph node not found');
    } catch (err: unknown) {
      if (err instanceof NotFoundError) throw err;
      throw new UpstreamError('GraphRepositoryMongo.updateNode failed', { cause: String(err) });
    }
  }

  /**
   * 특정 노드와 그 노드에 연결된 모든 엣지를 삭제합니다.
   * @param userId 사용자 ID
   * @param id 삭제할 노드의 ID (number)
   */
  async deleteNode(userId: string, id: number, options?: RepoOptions): Promise<void> {
    try {
      await this.graphNodes_col().deleteOne({ id, userId } as any, {
        ...options,
        session: options?.session as any,
      });
      await this.graphEdges_col().deleteMany(
        { userId, $or: [{ source: id }, { target: id }] } as any,
        { ...options, session: options?.session as any }
      );
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.deleteNode failed', { cause: String(err) });
    }
  }

  /**
   * 지정된 ID 목록에 해당하는 여러 노드를 삭제합니다.
   */
  async deleteNodes(userId: string, ids: number[], options?: RepoOptions): Promise<void> {
    try {
      await this.graphNodes_col().deleteMany({ id: { $in: ids }, userId } as any, {
        ...options,
        session: options?.session as any,
      });
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.deleteNodes failed', { cause: String(err) });
    }
  }

  /**
   * 특정 노드를 조회합니다.
   */
  async findNode(userId: string, id: number): Promise<GraphNodeDoc | null> {
    try {
      const doc: GraphNodeDoc | null = await this.graphNodes_col().findOne({
        id,
        userId,
      } as any);
      return doc;
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.findNode failed', { cause: String(err) });
    }
  }

  /**
   * 특정 사용자의 모든 노드 목록을 조회합니다.
   */
  async listNodes(userId: string): Promise<GraphNodeDoc[]> {
    try {
      const cursor: FindCursor<WithId<GraphNodeDoc>> = this.graphNodes_col().find({
        userId,
      } as any);
      return await cursor.toArray();
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.listNodes failed', { cause: String(err) });
    }
  }

  /**
   * 특정 클러스터에 속한 모든 노드 목록을 조회합니다.
   */
  async listNodesByCluster(userId: string, clusterId: string): Promise<GraphNodeDoc[]> {
    try {
      const cursor: FindCursor<WithId<GraphNodeDoc>> = this.graphNodes_col().find({
        userId,
        clusterId,
      } as any);
      return await cursor.toArray();
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.listNodesByCluster failed', {
        cause: String(err),
      });
    }
  }

  /**
   * 그래프 엣지를 생성하거나 갱신합니다(upsert).
   * @param edge 저장할 엣지 문서.
   * @returns 생성되거나 갱신된 엣지의 ID
   */
  async upsertEdge(edge: GraphEdgeDoc, options?: RepoOptions): Promise<string> {
    try {
      if (edge.source === edge.target)
        throw new ValidationError('edge source and target must differ');

      await this.graphEdges_col().updateOne(
        { id: edge.id, userId: edge.userId } as any,
        { $set: edge },
        { upsert: true, ...options, session: options?.session as any }
      );
      return edge.id;
    } catch (err: unknown) {
      if (err instanceof ValidationError) throw err;
      throw new UpstreamError('GraphRepositoryMongo.upsertEdge failed', { cause: String(err) });
    }
  }

  /**
   * 특정 엣지를 ID로 삭제합니다.
   */
  async deleteEdge(userId: string, edgeId: string, options?: RepoOptions): Promise<void> {
    try {
      await this.graphEdges_col().deleteOne({ id: edgeId, userId } as any, {
        ...options,
        session: options?.session as any,
      });
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.deleteEdge failed', { cause: String(err) });
    }
  }

  /**
   * 두 노드 사이에 있는 모든 엣지를 삭제합니다.
   */
  async deleteEdgeBetween(
    userId: string,
    source: number,
    target: number,
    options?: RepoOptions
  ): Promise<void> {
    try {
      await this.graphEdges_col().deleteMany(
        {
          userId,
          $or: [
            { source, target },
            { source: target, target: source },
          ],
        } as any,
        { ...options, session: options?.session as any }
      );
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.deleteEdgeBetween failed', {
        cause: String(err),
      });
    }
  }

  /**
   * 지정된 노드 ID 목록에 연결된 모든 엣지를 삭제합니다.
   */
  async deleteEdgesByNodeIds(
    userId: string,
    ids: number[],
    options?: RepoOptions
  ): Promise<void> {
    try {
      await this.graphEdges_col().deleteMany(
        {
          userId,
          $or: [{ source: { $in: ids } }, { target: { $in: ids } }],
        } as any,
        { ...options, session: options?.session as any }
      );
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.deleteEdgesByNodeIds failed', {
        cause: String(err),
      });
    }
  }

  /**
   * 특정 사용자의 모든 엣지 목록을 조회합니다.
   */
  async listEdges(userId: string): Promise<GraphEdgeDoc[]> {
    try {
      return await this.graphEdges_col()
        .find({ userId } as any)
        .toArray();
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.listEdges failed', { cause: String(err) });
    }
  }

  /**
   * 그래프 클러스터를 생성하거나 갱신합니다(upsert).
   * @param cluster 저장할 클러스터 문서.
   */
  async upsertCluster(cluster: GraphClusterDoc, options?: RepoOptions): Promise<void> {
    try {
      await this.graphClusters_col().updateOne(
        { id: cluster.id, userId: cluster.userId } as any,
        { $set: cluster },
        { upsert: true, ...options, session: options?.session as any }
      );
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.upsertCluster failed', { cause: String(err) });
    }
  }

  /**
   * 특정 클러스터를 삭제합니다.
   */
  async deleteCluster(userId: string, clusterId: string, options?: RepoOptions): Promise<void> {
    try {
      await this.graphClusters_col().deleteOne({ id: clusterId, userId } as any, {
        ...options,
        session: options?.session as any,
      });
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.deleteCluster failed', { cause: String(err) });
    }
  }

  /**
   * 특정 클러스터를 조회합니다.
   */
  async findCluster(userId: string, clusterId: string): Promise<GraphClusterDoc | null> {
    try {
      return await this.graphClusters_col().findOne({ id: clusterId, userId } as any);
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.findCluster failed', { cause: String(err) });
    }
  }

  /**
   * 특정 사용자의 모든 클러스터 목록을 조회합니다.
   */
  async listClusters(userId: string): Promise<GraphClusterDoc[]> {
    try {
      return await this.graphClusters_col()
        .find({ userId } as any)
        .toArray();
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.listClusters failed', { cause: String(err) });
    }
  }

  /**
   * 그래프 통계를 저장합니다. 사용자 ID를 키로 사용합니다.
   * @param stats 저장할 통계 문서.
   */
  async saveStats(stats: GraphStatsDoc, options?: RepoOptions): Promise<void> {
    try {
      await this.graphStats_col().updateOne(
        { id: stats.userId } as any,
        { $set: stats },
        { upsert: true, ...options, session: options?.session as any }
      );
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.saveStats failed', { cause: String(err) });
    }
  }

  /**
   * 특정 사용자의 그래프 통계를 조회합니다.
   */
  async getStats(userId: string): Promise<GraphStatsDoc | null> {
    try {
      return await this.graphStats_col().findOne({ userId } as any);
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.getStats failed', { cause: String(err) });
    }
  }

  /**
   * 특정 사용자의 그래프 통계를 삭제합니다.
   */
  async deleteStats(userId: string, options?: RepoOptions): Promise<void> {
    try {
      await this.graphStats_col().deleteOne({ id: userId } as any, {
        ...options,
        session: options?.session as any,
      });
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.deleteStats failed', { cause: String(err) });
    }
  }
}
