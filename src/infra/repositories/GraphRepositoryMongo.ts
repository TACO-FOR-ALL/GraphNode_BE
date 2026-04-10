import { FindCursor, UpdateResult, WithId } from 'mongodb';

import { GraphDocumentStore, RepoOptions } from '../../core/ports/GraphDocumentStore';
import {
  GraphClusterDoc,
  GraphEdgeDoc,
  GraphNodeDoc,
  GraphSubclusterDoc,
  GraphStatsDoc,
  GraphSummaryDoc,
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

  private graphSubclusters_col() {
    return this.db().collection<GraphSubclusterDoc>('graph_subclusters');
  }

  /**
   * 노드 생성 또는 업데이트 (upsert).
   * id와 userId를 기준으로 문서를 찾아 업데이트하거나 생성합니다.
   * 타임스탬프 책임: createdAt은 최초 삽입 시에만 설정($setOnInsert), updatedAt은 매 호출마다 갱신($set).
   * @param node 저장할 노드 문서.
   */
  async upsertNode(node: GraphNodeDoc, options?: RepoOptions): Promise<void> {
    try {
      const now = new Date().toISOString();
      const { createdAt: _c, updatedAt: _u, ...fields } = node;
      await this.graphNodes_col().updateOne(
        { id: node.id, userId: node.userId } as any,
        {
          $set: { ...(fields as any), updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, session: options?.session as any }
      );
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.upsertNode', err);
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
      const { updatedAt: _u, ...rest } = patch;
      const update: Partial<GraphNodeDoc> = {
        ...rest,
        updatedAt: new Date().toISOString(),
      };
      const res: UpdateResult<GraphNodeDoc> = await this.graphNodes_col().updateOne(
        { id, userId } as any,
        { $set: update },
        { ...options, session: options?.session as any }
      );
      if (res.matchedCount === 0) throw new NotFoundError('Graph node not found');
    } catch (err: unknown) {
      if (err instanceof NotFoundError) throw err;
      this.handleError('GraphRepositoryMongo.updateNode', err);
    }
  }

  /**
   * 특정 노드와 그 노드에 연결된 모든 엣지를 삭제합니다.
   *
   * @param userId 사용자 ID
   * @param id 삭제할 노드 ID
   * @param permanent 영구 삭제 여부 (true: Hard Delete, false: Soft Delete)
   * @param options (선택) 트랜잭션 옵션
   */
  async deleteNode(userId: string, id: number, permanent: boolean = false, options?: RepoOptions): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      if (permanent) {
        await this.graphNodes_col().deleteOne({ id, userId } as any, opts);
        await this.graphEdges_col().deleteMany(
          { userId, $or: [{ source: id }, { target: id }] } as any,
          opts
        );
      } else {
        const deletedAt = Date.now();
        await this.graphNodes_col().updateOne({ id, userId } as any, { $set: { deletedAt } }, opts);
        await this.graphEdges_col().updateMany(
          { userId, $or: [{ source: id }, { target: id }] } as any,
          { $set: { deletedAt } },
          opts
        );
      }
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.deleteNode', err);
    }
  }

  /**
   * 삭제된 노드 및 관련 엣지를 복구합니다.
   *
   * @param userId 사용자 ID
   * @param id 노드 ID
   * @param options (선택) 트랜잭션 옵션
   */
  async restoreNode(userId: string, id: number, options?: RepoOptions): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      await this.graphNodes_col().updateOne({ id, userId } as any, { $set: { deletedAt: null } }, opts);
      await this.graphEdges_col().updateMany(
        { userId, $or: [{ source: id }, { target: id }] } as any,
        { $set: { deletedAt: null } },
        opts
      );
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.restoreNode', err);
    }
  }

  /**
   * 지정된 ID 목록에 해당하는 여러 노드를 삭제합니다.
   */
  async deleteNodes(userId: string, ids: number[], permanent: boolean = false, options?: RepoOptions): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      if (permanent) {
        await this.graphNodes_col().deleteMany({ id: { $in: ids }, userId } as any, opts);
        await this.graphEdges_col().deleteMany({ userId, $or: [{ source: { $in: ids } }, { target: { $in: ids } }] } as any, opts);
      } else {
        const deletedAt = Date.now();
        await this.graphNodes_col().updateMany({ id: { $in: ids }, userId } as any, { $set: { deletedAt } }, opts);
        await this.graphEdges_col().updateMany({ userId, $or: [{ source: { $in: ids } }, { target: { $in: ids } }] } as any, { $set: { deletedAt } }, opts);
      }
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.deleteNodes', err);
    }
  }

  /**
   * 지정된 원본 ID(origId) 목록에 해당하는 노드들과 그 엣지들을 연쇄 삭제합니다.
   */
  async deleteNodesByOrigIds(userId: string, origIds: string[], permanent?: boolean, options?: RepoOptions): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      
      // 1. 해당 origId들을 가진 노드들을 찾아 id(number)를 추출
      const nodes = await this.graphNodes_col().find(
        { userId, origId: { $in: origIds } } as any,
        { ...opts, projection: { id: 1 } }
      ).toArray();

      const nodeIds = nodes.map(n => n.id);
      
      if (nodeIds.length === 0) return; // 지울 노드가 없음

      // 2. 추출한 nodeIds로 노드와 엣지 연쇄 삭제
      if (permanent) {
        await this.graphNodes_col().deleteMany({ id: { $in: nodeIds }, userId } as any, opts);
        await this.graphEdges_col().deleteMany({ userId, $or: [{ source: { $in: nodeIds } }, { target: { $in: nodeIds } }] } as any, opts);
      } else {
        const deletedAt = Date.now();
        await this.graphNodes_col().updateMany({ id: { $in: nodeIds }, userId } as any, { $set: { deletedAt } }, opts);
        await this.graphEdges_col().updateMany({ userId, $or: [{ source: { $in: nodeIds } }, { target: { $in: nodeIds } }] } as any, { $set: { deletedAt } }, opts);
      }
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.deleteNodesByOrigIds', err);
    }
  }

  /**
   * 지정된 원본 ID(origId) 목록에 해당하는 노드들과 그 엣지들을 복구합니다.
   */
  async restoreNodesByOrigIds(userId: string, origIds: string[], options?: RepoOptions): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      
      // 1. 해당 origId들을 가진 노드들을 찾아 id(number)를 추출 (삭제된 노드 포함)
      const nodes = await this.graphNodes_col().find(
        { userId, origId: { $in: origIds } } as any,
        { ...opts, projection: { id: 1 } }
      ).toArray();

      const nodeIds = nodes.map(n => n.id);
      
      if (nodeIds.length === 0) return;

      // 2. 노드 및 관련 엣지 복구 (deletedAt = null)
      await this.graphNodes_col().updateMany(
        { id: { $in: nodeIds }, userId } as any,
        { $set: { deletedAt: null } },
        opts
      );
      await this.graphEdges_col().updateMany(
        { userId, $or: [{ source: { $in: nodeIds } }, { target: { $in: nodeIds } }] } as any,
        { $set: { deletedAt: null } },
        opts
      );
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.restoreNodesByOrigIds', err);
    }
  }

  /**
   * 해당 사용자의 모든 그래프 데이터(노드, 엣지, 클러스터, 서브클러스터, 통계, 요약)를 삭제합니다.
   * 트랜잭션 등에서 호출될 수 있습니다.
   */
  async deleteAllGraphData(userId: string, _permanent?: boolean, options?: RepoOptions): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      // [Hard Delete Enforced] Always remove all graph data from DB
      await this.graphNodes_col().deleteMany({ userId } as any, opts);
      await this.graphEdges_col().deleteMany({ userId } as any, opts);
      await this.graphClusters_col().deleteMany({ userId } as any, opts);
      await this.graphSubclusters_col().deleteMany({ userId } as any, opts);
      await this.graphStats_col().deleteMany({ userId } as any, opts);
      await this.graphSummary_col().deleteMany({ userId } as any, opts);
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.deleteAllGraphData', err);
    }
  }

  /**
   * 전체 그래프 데이터 복구 (현재 Hard Delete 정책으로 인해 미지원)
   * 
   * @throws {UpstreamError} 복구가 지원되지 않음을 알림
   */
  async restoreAllGraphData(_userId: string, _options?: RepoOptions): Promise<void> {
    // [Hard Delete Policy] Restore is not supported in hard-delete only mode
    throw new UpstreamError('Restore is not supported in hard-delete only mode');
  }

  /**
   * 특정 노드를 조회합니다.
   */
  async findNode(userId: string, id: number): Promise<GraphNodeDoc | null> {
    try {
      const doc: GraphNodeDoc | null = await this.graphNodes_col().findOne({
        id,
        userId,
        deletedAt: { $in: [null, undefined] },
      } as any);
      
      if (doc && !doc.sourceType) {
        doc.sourceType = 'chat';
        await this.graphNodes_col().updateOne({ id: doc.id, userId: doc.userId } as any, { $set: { sourceType: 'chat' } });
      }
      
      return doc;
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.findNode', err);
    }
  }

  /**
   * 원본 ID(origId) 목록에 해당하는 노드들을 조회합니다.
   * 
   * @param userId 사용자 ID
   * @param origIds 원본 ID 목록
   * @returns 조회된 노드 문서 배열
   */
  async findNodesByOrigIds(userId: string, origIds: string[]): Promise<GraphNodeDoc[]> {
    try {
      const cursor: FindCursor<WithId<GraphNodeDoc>> = this.graphNodes_col().find({
        userId,
        origId: { $in: origIds },
        deletedAt: { $in: [null, undefined] },
      } as any);
      const docs = await cursor.toArray();

      const toUpdate = docs.filter((d) => !d.sourceType);
      if (toUpdate.length > 0) {
        const ids = toUpdate.map((d) => d.id);
        await this.graphNodes_col().updateMany(
          { id: { $in: ids }, userId } as any,
          { $set: { sourceType: 'chat' } }
        );
        toUpdate.forEach((d) => {
          d.sourceType = 'chat';
        });
      }

      return docs;
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.findNodesByOrigIds', err);
    }
  }

  /**
   * 특정 사용자의 모든 노드 목록을 조회합니다.
   */
  async listNodes(userId: string): Promise<GraphNodeDoc[]> {
    try {
      const cursor: FindCursor<WithId<GraphNodeDoc>> = this.graphNodes_col().find({
        userId,
        deletedAt: { $in: [null, undefined] },
      } as any);
      const docs = await cursor.toArray();

      const toUpdate = docs.filter(d => !d.sourceType);
      if (toUpdate.length > 0) {
        const ids = toUpdate.map(d => d.id);
        await this.graphNodes_col().updateMany(
          { id: { $in: ids }, userId } as any, 
          { $set: { sourceType: 'chat' } }
        );
        toUpdate.forEach(d => { d.sourceType = 'chat'; });
      }

      return docs;
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.listNodes', err);
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
        deletedAt: { $in: [null, undefined] },
      } as any);
      const docs = await cursor.toArray();

      const toUpdate = docs.filter(d => !d.sourceType);
      if (toUpdate.length > 0) {
        const ids = toUpdate.map(d => d.id);
        await this.graphNodes_col().updateMany(
          { id: { $in: ids }, userId } as any, 
          { $set: { sourceType: 'chat' } }
        );
        toUpdate.forEach(d => { d.sourceType = 'chat'; });
      }

      return docs;
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.listNodesByCluster', err);
    }
  }

  /**
   * 그래프 엣지를 생성하거나 갱신합니다(upsert).
   * 타임스탬프 책임: createdAt은 최초 삽입 시에만 설정($setOnInsert), updatedAt은 매 호출마다 갱신($set).
   * @param edge 저장할 엣지 문서.
   * @returns 생성되거나 갱신된 엣지의 ID
   */
  async upsertEdge(edge: GraphEdgeDoc, options?: RepoOptions): Promise<string> {
    try {
      if (edge.source === edge.target)
        throw new ValidationError('edge source and target must differ');

      const now = new Date().toISOString();
      const { createdAt: _c, updatedAt: _u, ...fields } = edge;
      await this.graphEdges_col().updateOne(
        { id: edge.id, userId: edge.userId } as any,
        {
          $set: { ...(fields as any), updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, session: options?.session as any }
      );
      return edge.id;
    } catch (err: unknown) {
      if (err instanceof ValidationError) throw err;
      this.handleError('GraphRepositoryMongo.upsertEdge', err);
    }
  }

  /**
   * 특정 엣지를 ID로 삭제합니다.
   */
  async deleteEdge(userId: string, edgeId: string, _permanent?: boolean, options?: RepoOptions): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      // [Hard Delete Enforced]
      await this.graphEdges_col().deleteOne({ id: edgeId, userId } as any, opts);
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.deleteEdge', err);
    }
  }

  /**
   * 두 노드 사이에 있는 모든 엣지를 삭제합니다.
   */
  async deleteEdgeBetween(
    userId: string,
    source: number,
    target: number,
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      const filter = {
        userId,
        $or: [
          { source, target },
          { source: target, target: source },
        ],
      } as any;
      if (permanent) {
        await this.graphEdges_col().deleteMany(filter, opts);
      } else {
        await this.graphEdges_col().updateMany(filter, { $set: { deletedAt: Date.now() } }, opts);
      }
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.deleteEdgeBetween', err);
    }
  }

  /**
   * 지정된 노드 ID 목록에 연결된 모든 엣지를 삭제합니다.
   */
  async deleteEdgesByNodeIds(
    userId: string,
    ids: number[],
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      const filter = {
        userId,
        $or: [{ source: { $in: ids } }, { target: { $in: ids } }],
      } as any;
      if (permanent) {
        await this.graphEdges_col().deleteMany(filter, opts);
      } else {
        await this.graphEdges_col().updateMany(filter, { $set: { deletedAt: Date.now() } }, opts);
      }
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.deleteEdgesByNodeIds', err);
    }
  }

  /**
   * 삭제된 엣지를 복구합니다.
   * 
   * @param userId 사용자 ID
   * @param edgeId 엣지 ID
   * @param options (선택) 트랜잭션 옵션
   */
  async restoreEdge(userId: string, edgeId: string, options?: RepoOptions): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      await this.graphEdges_col().updateOne(
        { id: edgeId, userId } as any,
        { $set: { deletedAt: null } },
        opts
      );
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.restoreEdge', err);
    }
  }

  /**
   * 특정 사용자의 모든 엣지 목록을 조회합니다.
   */
  async listEdges(userId: string): Promise<GraphEdgeDoc[]> {
    try {
      return await this.graphEdges_col()
        .find({ userId, deletedAt: { $in: [null, undefined] } } as any)
        .toArray();
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.listEdges', err);
    }
  }

  /**
   * 그래프 클러스터를 생성하거나 갱신합니다(upsert).
   * 타임스탬프 책임: createdAt은 최초 삽입 시에만 설정($setOnInsert), updatedAt은 매 호출마다 갱신($set).
   * @param cluster 저장할 클러스터 문서.
   */
  async upsertCluster(cluster: GraphClusterDoc, options?: RepoOptions): Promise<void> {
    try {
      const now = new Date().toISOString();
      const { createdAt: _c, updatedAt: _u, ...fields } = cluster;
      await this.graphClusters_col().updateOne(
        { id: cluster.id, userId: cluster.userId } as any,
        {
          $set: { ...(fields as any), updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, session: options?.session as any }
      );
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.upsertCluster', err);
    }
  }

  /**
   * 특정 클러스터를 삭제합니다.
   */
  async deleteCluster(userId: string, clusterId: string, _permanent?: boolean, options?: RepoOptions): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      // [Hard Delete Enforced]
      await this.graphClusters_col().deleteOne({ id: clusterId, userId } as any, opts);
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.deleteCluster', err);
    }
  }

  /**
   * 삭제된 클러스터를 복구합니다.
   * 
   * @param userId 사용자 ID
   * @param clusterId 클러스터 ID
   * @param options (선택) 트랜잭션 옵션
   */
  async restoreCluster(userId: string, clusterId: string, options?: RepoOptions): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      await this.graphClusters_col().updateOne(
        { id: clusterId, userId } as any,
        { $set: { deletedAt: null } },
        opts
      );
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.restoreCluster', err);
    }
  }

  /**
   * 특정 클러스터를 조회합니다.
   */
  async findCluster(userId: string, clusterId: string): Promise<GraphClusterDoc | null> {
    try {
      return await this.graphClusters_col().findOne({ id: clusterId, userId, deletedAt: { $in: [null, undefined] } } as any);
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.findCluster', err);
    }
  }

  /**
   * 특정 사용자의 모든 클러스터 목록을 조회합니다.
   */
  async listClusters(userId: string): Promise<GraphClusterDoc[]> {
    try {
      return await this.graphClusters_col()
        .find({ userId, deletedAt: { $in: [null, undefined] } } as any)
        .toArray();
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.listClusters', err);
    }
  }



  /**
   * 서브클러스터 생성 또는 업데이트 (upsert)
   * 타임스탬프 책임: createdAt은 최초 삽입 시에만 설정($setOnInsert), updatedAt은 매 호출마다 갱신($set).
   * @param subcluster 저장할 서브클러스터 문서
   * @param options (선택) 트랜잭션 옵션
   */
  async upsertSubcluster(subcluster: GraphSubclusterDoc, options?: RepoOptions): Promise<void> {
    try {
      const now = new Date().toISOString();
      const { createdAt: _c, updatedAt: _u, ...fields } = subcluster;
      await this.graphSubclusters_col().updateOne(
        { id: subcluster.id, userId: subcluster.userId } as any,
        {
          $set: { ...(fields as any), updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, session: options?.session as any }
      );
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.upsertSubcluster', err);
    }
  }

  /**
   * 서브클러스터를 삭제합니다.
   * 
   * @param userId 사용자 ID
   * @param subclusterId 서브클러스터 ID
   * @param permanent 영구 삭제 여부
   * @param options (선택) 트랜잭션 옵션
   */
  async deleteSubcluster(
    userId: string,
    subclusterId: string,
    _permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      // [Hard Delete Enforced]
      await this.graphSubclusters_col().deleteOne({ id: subclusterId, userId } as any, opts);
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.deleteSubcluster', err);
    }
  }

  /**
   * 삭제된 서브클러스터를 복구합니다.
   * 
   * @param userId 사용자 ID
   * @param subclusterId 서브클러스터 ID
   * @param options (선택) 트랜잭션 옵션
   */
  async restoreSubcluster(userId: string, subclusterId: string, options?: RepoOptions): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      await this.graphSubclusters_col().updateOne(
        { id: subclusterId, userId } as any,
        { $set: { deletedAt: null } },
        opts
      );
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.restoreSubcluster', err);
    }
  }

  /**
   * 사용자의 모든 서브클러스터 목록을 조회합니다.
   * 
   * @param userId 사용자 ID
   * @returns 서브클러스터 문서 배열
   */
  async listSubclusters(userId: string): Promise<GraphSubclusterDoc[]> {
    try {
      return await this.graphSubclusters_col()
        .find({ userId, deletedAt: { $in: [null, undefined] } } as any)
        .toArray();
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.listSubclusters', err);
    }
  }

  /**
   * 그래프 통계를 저장합니다. 사용자 ID를 키로 사용합니다.
   * 타임스탬프 책임: updatedAt은 매 호출마다 repository가 갱신합니다.
   * @param stats 저장할 통계 문서.
   */
  async saveStats(stats: GraphStatsDoc, options?: RepoOptions): Promise<void> {
    try {
      const now = new Date().toISOString();
      const { updatedAt: _u, ...fields } = stats;
      await this.graphStats_col().updateOne(
        { userId: stats.userId } as any,
        { $set: { ...(fields as any), updatedAt: now } },
        { upsert: true, session: options?.session as any }
      );
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.saveStats', err);
    }
  }

  /**
   * 특정 사용자의 그래프 통계를 조회합니다.
   */
  async getStats(userId: string): Promise<GraphStatsDoc | null> {
    try {
      return await this.graphStats_col().findOne({ userId, deletedAt: { $in: [null, undefined] } } as any);
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.getStats', err);
    }
  }

  /**
   * 특정 사용자의 그래프 통계를 삭제합니다.
   */
  async deleteStats(userId: string, _permanent?: boolean, options?: RepoOptions): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      // [Hard Delete Enforced]
      await this.graphStats_col().deleteOne({ userId } as any, opts);
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.deleteStats', err);
    }
  }

  // --- Insight Summary ---

  private graphSummary_col() {
    return this.db().collection<GraphSummaryDoc>('graph_summaries');
  }

  async upsertGraphSummary(
    userId: string,
    summary: GraphSummaryDoc,
    options?: RepoOptions
  ): Promise<void> {
    try {
      // id는 userId로 가정하거나 summary.id 사용. 여기서는 userId 기준 1:1로 가정
      const filter = { userId: userId } as any;
      const update = { $set: summary };
      await this.graphSummary_col().updateOne(filter, update, {
        upsert: true,
        session: options?.session as any,
      });
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.upsertGraphSummary', err);
    }
  }

  async getGraphSummary(userId: string): Promise<GraphSummaryDoc | null> {
    try {
      const doc = await this.graphSummary_col().findOne({ userId: userId, deletedAt: { $in: [null, undefined] } } as any);
      return doc;
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.getGraphSummary', err);
    }
  }

  async deleteGraphSummary(userId: string, _permanent?: boolean, options?: RepoOptions): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      // [Hard Delete Enforced]
      await this.graphSummary_col().deleteOne({ userId } as any, opts);
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.deleteGraphSummary', err);
    }
  }

  /**
   * 삭제된 그래프 요약/인사이트를 복구합니다 (현재 Hard Delete 정책으로 인해 미지원).
   * 
   * @throws {UpstreamError} 복구가 지원되지 않음을 알림
   */
  async restoreGraphSummary(_userId: string, _options?: RepoOptions): Promise<void> {
    // [Hard Delete Policy] Restore is no longer supported
    throw new UpstreamError('Restore is not supported in hard-delete only mode');
  }

  private handleError(methodName: string, err: unknown): never {
    if (
      err instanceof Error &&
      ((err as any).hasErrorLabel?.('TransientTransactionError') ||
        (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
    ) {
      throw err;
    }
    throw new UpstreamError(`${methodName} failed`, { cause: String(err) });
  }
}
