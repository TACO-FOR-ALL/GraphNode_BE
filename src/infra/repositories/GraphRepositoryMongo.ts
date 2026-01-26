import { FindCursor, UpdateResult, WithId, UpdateOptions, DeleteOptions, Sort } from 'mongodb';
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
   * 노드의 복합 키를 생성합니다.
   * @param userId 사용자 ID
   * @param nodeId 노드 ID
   * @returns `userId::nodeId` 형식의 문자열 키
   */
  private nodeKey(userId: string, nodeId: number) {
    return `${userId}::${nodeId}`;
  }

  /**
   * 엣지의 복합 키를 생성합니다.
   * @param userId 사용자 ID
   * @param source 출발 노드 ID
   * @param target 도착 노드 ID
   * @param override 제공될 경우, 이 값을 키로 사용합니다.
   * @returns `userId::source->target` 형식의 문자열 키
   */
  private edgeKey(userId: string, source: number, target: number, override?: string) {
    if (override) return override;
    return `${userId}::${source}->${target}`;
  }

  /**
   * 클러스터의 복합 키를 생성합니다.
   * @param userId 사용자 ID
   * @param clusterId 클러스터 ID
   * @returns `userId::clusterId` 형식의 문자열 키
   */
  private clusterKey(userId: string, clusterId: string) {
    return `${userId}::${clusterId}`;
  }

  /**
   * 그래프 노드를 생성하거나 갱신합니다(upsert).
   * @param node 저장할 노드 문서.
   * @throws {UpstreamError} MongoDB 작업 실패 시
   */
  async upsertNode(node: GraphNodeDoc, options?: RepoOptions): Promise<void> {
    try {
      // _id는 이미 Mapper에서 생성되어 전달됨을 가정하거나, 여기서 검증할 수 있음.
      // 하지만 Rule 1에 따라 Repo는 DB Type을 그대로 받으므로, _id가 포함되어 있어야 함.
      await this.graphNodes_col().updateOne(
        { _id: node._id } as any,
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
   * @param nodeId 갱신할 노드의 ID
   * @param patch 갱신할 속성 객체
   * @throws {NotFoundError} 해당 노드가 없을 경우
   * @throws {UpstreamError} MongoDB 작업 실패 시
   */
  async updateNode(
    userId: string,
    nodeId: number,
    patch: Partial<GraphNodeDoc>,
    options?: RepoOptions
  ): Promise<void> {
    try {
      const docId: string = this.nodeKey(userId, nodeId);
      const update: Partial<GraphNodeDoc> = {
        ...patch,
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
      };
      const res: UpdateResult<GraphNodeDoc> = await this.graphNodes_col().updateOne(
        { _id: docId } as any,
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
   * @param nodeId 삭제할 노드의 ID
   * @throws {UpstreamError} MongoDB 작업 실패 시
   */
  async deleteNode(userId: string, nodeId: number, options?: RepoOptions): Promise<void> {
    try {
      const docId: string = this.nodeKey(userId, nodeId);
      await this.graphNodes_col().deleteOne({ _id: docId } as any, {
        ...options,
        session: options?.session as any,
      });
      await this.graphEdges_col().deleteMany(
        { userId, $or: [{ source: nodeId }, { target: nodeId }] } as any,
        { ...options, session: options?.session as any }
      );
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.deleteNode failed', { cause: String(err) });
    }
  }

  /**
   * 지정된 ID 목록에 해당하는 여러 노드를 삭제합니다.
   * @param userId 사용자 ID
   * @param nodeIds 삭제할 노드 ID 배열
   * @param options 트랜잭션 세션 등 추가 옵션
   * @throws {UpstreamError} MongoDB 작업 실패 시
   */
  async deleteNodes(userId: string, nodeIds: number[], options?: RepoOptions): Promise<void> {
    try {
      const docIds: string[] = nodeIds.map((id) => this.nodeKey(userId, id));
      await this.graphNodes_col().deleteMany({ _id: { $in: docIds } } as any, {
        ...options,
        session: options?.session as any,
      });
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.deleteNodes failed', { cause: String(err) });
    }
  }

  /**
   * 특정 노드를 조회합니다.
   * @param userId 사용자 ID
   * @param nodeId 조회할 노드의 ID
   * @returns 조회된 노드 문서. 없으면 `null`을 반환합니다.
   * @throws {UpstreamError} MongoDB 작업 실패 시
   */
  async findNode(userId: string, nodeId: number): Promise<GraphNodeDoc | null> {
    try {
      const docId: string = this.nodeKey(userId, nodeId);
      const doc: GraphNodeDoc | null = await this.graphNodes_col().findOne({ _id: docId } as any);
      return doc;
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.findNode failed', { cause: String(err) });
    }
  }

  /**
   * 특정 사용자의 모든 노드 목록을 조회합니다.
   * @param userId 사용자 ID
   * @returns 노드 문서 배열
   * @throws {UpstreamError} MongoDB 작업 실패 시
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
   * @param userId 사용자 ID
   * @param clusterId 클러스터 ID
   * @returns 노드 문서 배열
   * @throws {UpstreamError} MongoDB 작업 실패 시
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
   * @returns 생성되거나 갱신된 엣지의 ID (_id)
   * @throws {ValidationError} 출발지와 목적지가 같은 엣지일 경우
   * @throws {UpstreamError} MongoDB 작업 실패 시
   */
  async upsertEdge(edge: GraphEdgeDoc, options?: RepoOptions): Promise<string> {
    try {
      if (edge.source === edge.target)
        throw new ValidationError('edge source and target must differ');
      // _id는 Mapper에서 생성되어야 함.
      await this.graphEdges_col().updateOne(
        { _id: edge._id } as any,
        { $set: edge },
        { upsert: true, ...options, session: options?.session as any }
      );
      return edge._id as string;
    } catch (err: unknown) {
      if (err instanceof ValidationError) throw err;
      throw new UpstreamError('GraphRepositoryMongo.upsertEdge failed', { cause: String(err) });
    }
  }

  /**
   * 특정 엣지를 ID로 삭제합니다.
   * @param userId 사용자 ID
   * @param edgeId 삭제할 엣지의 ID
   * @throws {UpstreamError} MongoDB 작업 실패 시
   */
  async deleteEdge(userId: string, edgeId: string, options?: RepoOptions): Promise<void> {
    try {
      await this.graphEdges_col().deleteOne({ _id: edgeId, userId } as any, {
        ...options,
        session: options?.session as any,
      });
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.deleteEdge failed', { cause: String(err) });
    }
  }

  /**
   * 두 노드 사이에 있는 모든 엣지를 삭제합니다.
   * @param userId 사용자 ID
   * @param source 출발 노드 ID
   * @param target 도착 노드 ID
   * @throws {UpstreamError} MongoDB 작업 실패 시
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
   * @param userId 사용자 ID
   * @param nodeIds 삭제할 엣지들의 기준이 되는 노드 ID 배열
   * @param options 트랜잭션 세션 등 추가 옵션
   * @throws {UpstreamError} MongoDB 작업 실패 시
   */
  async deleteEdgesByNodeIds(
    userId: string,
    nodeIds: number[],
    options?: RepoOptions
  ): Promise<void> {
    try {
      await this.graphEdges_col().deleteMany(
        {
          userId,
          $or: [{ source: { $in: nodeIds } }, { target: { $in: nodeIds } }],
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
   * @param userId 사용자 ID
   * @returns 엣지 문서 배열
   * @throws {UpstreamError} MongoDB 작업 실패 시
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
   * @throws {UpstreamError} MongoDB 작업 실패 시
   */
  async upsertCluster(cluster: GraphClusterDoc, options?: RepoOptions): Promise<void> {
    try {
      await this.graphClusters_col().updateOne(
        { _id: cluster._id } as any,
        { $set: cluster },
        { upsert: true, ...options, session: options?.session as any }
      );
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.upsertCluster failed', { cause: String(err) });
    }
  }

  /**
   * 특정 클러스터를 삭제합니다.
   * @param userId 사용자 ID
   * @param clusterId 삭제할 클러스터의 ID
   * @throws {UpstreamError} MongoDB 작업 실패 시
   */
  async deleteCluster(userId: string, clusterId: string, options?: RepoOptions): Promise<void> {
    try {
      const docId = this.clusterKey(userId, clusterId);
      await this.graphClusters_col().deleteOne({ _id: docId } as any, {
        ...options,
        session: options?.session as any,
      });
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.deleteCluster failed', { cause: String(err) });
    }
  }

  /**
   * 특정 클러스터를 조회합니다.
   * @param userId 사용자 ID
   * @param clusterId 조회할 클러스터의 ID
   * @returns 조회된 클러스터 문서. 없으면 `null`을 반환합니다.
   * @throws {UpstreamError} MongoDB 작업 실패 시
   */
  async findCluster(userId: string, clusterId: string): Promise<GraphClusterDoc | null> {
    try {
      const docId: string = this.clusterKey(userId, clusterId);
      return await this.graphClusters_col().findOne({ _id: docId } as any);
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.findCluster failed', { cause: String(err) });
    }
  }

  /**
   * 특정 사용자의 모든 클러스터 목록을 조회합니다.
   * @param userId 사용자 ID
   * @returns 클러스터 문서 배열
   * @throws {UpstreamError} MongoDB 작업 실패 시
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
   * @throws {UpstreamError} MongoDB 작업 실패 시
   */
  async saveStats(stats: GraphStatsDoc, options?: RepoOptions): Promise<void> {
    try {
      await this.graphStats_col().updateOne(
        { _id: stats.userId } as any,
        { $set: stats },
        { upsert: true, ...options, session: options?.session as any }
      );
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.saveStats failed', { cause: String(err) });
    }
  }

  /**
   * 특정 사용자의 그래프 통계를 조회합니다.
   * @param userId 사용자 ID
   * @returns 조회된 통계 문서. 없으면 `null`을 반환합니다.
   * @throws {UpstreamError} MongoDB 작업 실패 시
   */
  async getStats(userId: string): Promise<GraphStatsDoc | null> {
    try {
      return await this.graphStats_col().findOne({ _id: userId } as any);
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.getStats failed', { cause: String(err) });
    }
  }

  /**
   * 특정 사용자의 그래프 통계를 삭제합니다.
   * @param userId 사용자 ID
   * @throws {UpstreamError} MongoDB 작업 실패 시
   */
  async deleteStats(userId: string, options?: RepoOptions): Promise<void> {
    try {
      await this.graphStats_col().deleteOne({ _id: userId } as any, {
        ...options,
        session: options?.session as any,
      });
    } catch (err: unknown) {
      throw new UpstreamError('GraphRepositoryMongo.deleteStats failed', { cause: String(err) });
    }
  }
}
