import { AnyBulkWriteOperation, FindCursor, UpdateResult, WithId } from 'mongodb';

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

/**
 * MongoDB 기반 Macro Graph 문서 저장소 구현체입니다.
 *
 * @deprecated 작성일: 2026-04-27.
 * 원인: Macro Graph의 장기 저장소가 MongoDB document store에서 Neo4j Native Graph 구조로
 * 이관될 예정입니다. 신규 Macro Graph 런타임 코드는 이 class를
 * 직접 사용하지 말고 관계 기반 Neo4j 저장소 계층을 사용해야 합니다. 이 구현체는
 * 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해 당분간 보존합니다.
 */
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
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
   * 여러 그래프 노드를 한 번의 bulkWrite로 생성 또는 갱신합니다.
   *
   * @param nodes 저장할 노드 문서 배열
   * @param options (선택) 트랜잭션 세션 등 저장 옵션
   * @returns Promise<void>
   * @remarks
   * - 각 노드는 `(id, userId)`를 기준으로 upsert 됩니다.
   * - `createdAt`은 신규 삽입 시에만 설정되고, `updatedAt`은 현재 시각으로 일괄 갱신됩니다.
   * - 입력 배열이 비어 있으면 저장을 건너뜁니다.
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async upsertNodes(nodes: GraphNodeDoc[], options?: RepoOptions): Promise<void> {
    try {
      if (nodes.length === 0) return;

      const now = new Date().toISOString();
      const operations: AnyBulkWriteOperation<GraphNodeDoc>[] = nodes.map((node) => {
        const { createdAt: _c, updatedAt: _u, ...fields } = node;
        return {
          updateOne: {
            filter: { id: node.id, userId: node.userId } as any,
            update: {
              $set: { ...(fields as any), updatedAt: now },
              $setOnInsert: { createdAt: now },
            },
            upsert: true,
          },
        };
      });

      await this.graphNodes_col().bulkWrite(operations, {
        ordered: true,
        session: options?.session as any,
      });
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.upsertNodes', err);
    }
  }

  /**
   * 기존 그래프 노드의 일부 속성을 갱신합니다.
   * @param userId 사용자 ID
   * @param id 갱신할 노드의 ID (number)
   * @param patch 갱신할 속성 객체
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async deleteNode(
    userId: string,
    id: number,
    permanent: boolean = false,
    options?: RepoOptions
  ): Promise<void> {
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
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async restoreNode(userId: string, id: number, options?: RepoOptions): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      await this.graphNodes_col().updateOne(
        { id, userId } as any,
        { $set: { deletedAt: null } },
        opts
      );
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
   *
   * @param userId 사용자 ID
   * @param ids 노드 ID 목록
   * @param permanent 완전 삭제 여부
   * @param options (선택) 트랜잭션 옵션
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async deleteNodes(
    userId: string,
    ids: number[],
    permanent: boolean = false,
    options?: RepoOptions
  ): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };
      if (permanent) {
        await this.graphNodes_col().deleteMany({ id: { $in: ids }, userId } as any, opts);
        await this.graphEdges_col().deleteMany(
          { userId, $or: [{ source: { $in: ids } }, { target: { $in: ids } }] } as any,
          opts
        );
      } else {
        const deletedAt = Date.now();
        await this.graphNodes_col().updateMany(
          { id: { $in: ids }, userId } as any,
          { $set: { deletedAt } },
          opts
        );
        await this.graphEdges_col().updateMany(
          { userId, $or: [{ source: { $in: ids } }, { target: { $in: ids } }] } as any,
          { $set: { deletedAt } },
          opts
        );
      }
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.deleteNodes', err);
    }
  }

  /**
   * 지정된 원본 ID(origId) 목록에 해당하는 노드들과 그 엣지들을 연쇄 삭제합니다.
   *
   * @param userId 사용자 ID
   * @param origIds 원본 ID 목록
   * @param permanent 완전 삭제 여부
   * @param options (선택) 트랜잭션 옵션
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async deleteNodesByOrigIds(
    userId: string,
    origIds: string[],
    permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };

      // 1. 해당 origId들을 가진 노드들을 찾아 id(number)를 추출
      const nodes = await this.graphNodes_col()
        .find({ userId, origId: { $in: origIds } } as any, { ...opts, projection: { id: 1 } })
        .toArray();

      const nodeIds = nodes.map((n) => n.id);

      if (nodeIds.length === 0) return; // 지울 노드가 없음

      // 2. 추출한 nodeIds로 노드와 엣지 연쇄 삭제
      if (permanent) {
        await this.graphNodes_col().deleteMany({ id: { $in: nodeIds }, userId } as any, opts);
        await this.graphEdges_col().deleteMany(
          { userId, $or: [{ source: { $in: nodeIds } }, { target: { $in: nodeIds } }] } as any,
          opts
        );
      } else {
        const deletedAt = Date.now();
        await this.graphNodes_col().updateMany(
          { id: { $in: nodeIds }, userId } as any,
          { $set: { deletedAt } },
          opts
        );
        await this.graphEdges_col().updateMany(
          { userId, $or: [{ source: { $in: nodeIds } }, { target: { $in: nodeIds } }] } as any,
          { $set: { deletedAt } },
          opts
        );
      }
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.deleteNodesByOrigIds', err);
    }
  }

  /**
   * 지정된 원본 ID(origId) 목록에 해당하는 노드들과 그 엣지들을 복구합니다.
   *
   * @param userId 사용자 ID
   * @param origIds 원본 ID 목록
   * @param options (선택) 트랜잭션 옵션
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async restoreNodesByOrigIds(
    userId: string,
    origIds: string[],
    options?: RepoOptions
  ): Promise<void> {
    try {
      const opts = { ...options, session: options?.session as any };

      // 1. 해당 origId들을 가진 노드들을 찾아 id(number)를 추출 (삭제된 노드 포함)
      const nodes = await this.graphNodes_col()
        .find({ userId, origId: { $in: origIds } } as any, { ...opts, projection: { id: 1 } })
        .toArray();

      const nodeIds = nodes.map((n) => n.id);

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
   *
   * @param userId 사용자 ID
   * @param _permanent 영구 삭제 여부 (현재 사용되지 않음)
   * @param options (선택) 트랜잭션 옵션
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async deleteAllGraphData(
    userId: string,
    _permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
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
   * @param _userId 사용자 ID (현재 사용되지 않음)
   * @param _options (선택) 트랜잭션 옵션
   * @throws {UpstreamError} 복구가 지원되지 않음을 알림
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async restoreAllGraphData(_userId: string, _options?: RepoOptions): Promise<void> {
    // [Hard Delete Policy] Restore is not supported in hard-delete only mode
    throw new UpstreamError('Restore is not supported in hard-delete only mode');
  }

  /**
   * 특정 노드를 조회합니다.
   *
   * @param userId 사용자 ID
   * @param id 노드 ID
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
        await this.graphNodes_col().updateOne({ id: doc.id, userId: doc.userId } as any, {
          $set: { sourceType: 'chat' },
        });
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
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
        await this.graphNodes_col().updateMany({ id: { $in: ids }, userId } as any, {
          $set: { sourceType: 'chat' },
        });
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
   * 원본 ID(origId) 목록에 해당하는 노드들을 조회합니다 (삭제된 노드 포함).
   * 백그라운드 워커에서 중복 생성을 방지(Deduplication)하기 위해 사용됩니다.
   *
   * @param userId - 작업을 요청한 사용자 ID
   * @param origIds - 원본 ID 목록
   * @returns 조회된 노드 문서 배열
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async findNodesByOrigIdsAll(userId: string, origIds: string[]): Promise<GraphNodeDoc[]> {
    try {
      // deletedAt고 관계 없이 조회
      const cursor: FindCursor<WithId<GraphNodeDoc>> = this.graphNodes_col().find({
        userId,
        origId: { $in: origIds },
      } as any);
      const docs = await cursor.toArray();

      // sourceType이 없는 경우 chat으로 설정
      const toUpdate = docs.filter((d) => !d.sourceType);
      if (toUpdate.length > 0) {
        const ids = toUpdate.map((d) => d.id);
        await this.graphNodes_col().updateMany({ id: { $in: ids }, userId } as any, {
          $set: { sourceType: 'chat' },
        });
        toUpdate.forEach((d) => {
          d.sourceType = 'chat';
        });
      }

      return docs;
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.findNodesByOrigIdsAll', err);
    }
  }

  /**
   * 특정 사용자의 모든 노드 목록을 조회합니다.
   * @param userId 사용자 ID
   * @returns 조회된 노드 문서 배열
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async listNodes(userId: string): Promise<GraphNodeDoc[]> {
    try {
      const cursor: FindCursor<WithId<GraphNodeDoc>> = this.graphNodes_col().find({
        userId,
        deletedAt: { $in: [null, undefined] },
      } as any);
      const docs = await cursor.toArray();

      // sourceType이 없는 경우 chat으로 설정
      const toUpdate = docs.filter((d) => !d.sourceType);
      if (toUpdate.length > 0) {
        const ids = toUpdate.map((d) => d.id);
        await this.graphNodes_col().updateMany({ id: { $in: ids }, userId } as any, {
          $set: { sourceType: 'chat' },
        });
        toUpdate.forEach((d) => {
          d.sourceType = 'chat';
        });
      }

      return docs;
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.listNodes', err);
    }
  }

  /**
   * 특정 사용자의 모든 노드 목록을 조회합니다 (삭제된 노드 포함).
   * 백그라운드 워커에서 이미 존재하는 노드인지(중복 제거) 확인하기 위해 사용됩니다.
   *
   * @param userId - 작업을 요청한 사용자 ID
   * @returns 조회된 노드 문서 배열
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async listNodesAll(userId: string): Promise<GraphNodeDoc[]> {
    try {
      // deletedAt고 관계 없이 조회
      const cursor: FindCursor<WithId<GraphNodeDoc>> = this.graphNodes_col().find({
        userId,
      } as any);
      const docs = await cursor.toArray();

      const toUpdate = docs.filter((d) => !d.sourceType);
      if (toUpdate.length > 0) {
        const ids = toUpdate.map((d) => d.id);
        await this.graphNodes_col().updateMany({ id: { $in: ids }, userId } as any, {
          $set: { sourceType: 'chat' },
        });
        toUpdate.forEach((d) => {
          d.sourceType = 'chat';
        });
      }

      return docs;
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.listNodesAll', err);
    }
  }

  /**
   * 특정 클러스터에 속한 모든 노드 목록을 조회합니다.
   * @param userId 사용자 ID
   * @param clusterId 클러스터 ID
   * @returns 조회된 노드 문서 배열
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async listNodesByCluster(userId: string, clusterId: string): Promise<GraphNodeDoc[]> {
    try {
      const cursor: FindCursor<WithId<GraphNodeDoc>> = this.graphNodes_col().find({
        userId,
        clusterId,
        deletedAt: { $in: [null, undefined] },
      } as any);
      const docs = await cursor.toArray();

      const toUpdate = docs.filter((d) => !d.sourceType);
      if (toUpdate.length > 0) {
        const ids = toUpdate.map((d) => d.id);
        await this.graphNodes_col().updateMany({ id: { $in: ids }, userId } as any, {
          $set: { sourceType: 'chat' },
        });
        toUpdate.forEach((d) => {
          d.sourceType = 'chat';
        });
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
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
   * 여러 그래프 엣지를 한 번의 bulkWrite로 생성 또는 갱신합니다.
   *
   * @param edges 저장할 엣지 문서 배열
   * @param options (선택) 트랜잭션 세션 등 저장 옵션
   * @returns Promise<void>
   * @throws {ValidationError} self-loop 엣지가 포함된 경우
   * @remarks
   * - 각 엣지는 `(id, userId)`를 기준으로 upsert 됩니다.
   * - `createdAt`은 신규 삽입 시에만 설정되고, `updatedAt`은 현재 시각으로 일괄 갱신됩니다.
   * - 입력 배열이 비어 있으면 저장을 건너뜁니다.
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async upsertEdges(edges: GraphEdgeDoc[], options?: RepoOptions): Promise<void> {
    try {
      if (edges.length === 0) return;

      for (const edge of edges) {
        if (edge.source === edge.target) {
          throw new ValidationError('edge source and target must differ');
        }
      }

      const now = new Date().toISOString();
      const operations: AnyBulkWriteOperation<GraphEdgeDoc>[] = edges.map((edge) => {
        const { createdAt: _c, updatedAt: _u, ...fields } = edge;
        return {
          updateOne: {
            filter: { id: edge.id, userId: edge.userId } as any,
            update: {
              $set: { ...(fields as any), updatedAt: now },
              $setOnInsert: { createdAt: now },
            },
            upsert: true,
          },
        };
      });

      await this.graphEdges_col().bulkWrite(operations, {
        ordered: true,
        session: options?.session as any,
      });
    } catch (err: unknown) {
      if (err instanceof ValidationError) throw err;
      this.handleError('GraphRepositoryMongo.upsertEdges', err);
    }
  }

  /**
   * 특정 엣지를 ID로 삭제합니다.
   * @param userId 사용자 ID
   * @param edgeId 엣지 ID
   * @param permanent 완전 삭제 여부
   * @param options 트랜잭션 옵션
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async deleteEdge(
    userId: string,
    edgeId: string,
    _permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
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
   *
   * @param userId 사용자 ID
   * @param source 노드 ID
   * @param target 노드 ID
   * @param permanent 완전 삭제 여부
   * @param options (선택) 트랜잭션 옵션
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
   *
   * @param userId 사용자 ID
   * @param ids 노드 ID 목록
   * @param permanent 완전 삭제 여부
   * @param options (선택) 트랜잭션 옵션
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
   * 여러 그래프 클러스터를 한 번의 bulkWrite로 생성 또는 갱신합니다.
   *
   * @param clusters 저장할 클러스터 문서 배열
   * @param options (선택) 트랜잭션 세션 등 저장 옵션
   * @returns Promise<void>
   * @remarks
   * - 각 클러스터는 `(id, userId)`를 기준으로 upsert 됩니다.
   * - `createdAt`은 신규 삽입 시에만 설정되고, `updatedAt`은 현재 시각으로 일괄 갱신됩니다.
   * - 입력 배열이 비어 있으면 저장을 건너뜁니다.
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async upsertClusters(clusters: GraphClusterDoc[], options?: RepoOptions): Promise<void> {
    try {
      if (clusters.length === 0) return;

      const now = new Date().toISOString();
      const operations: AnyBulkWriteOperation<GraphClusterDoc>[] = clusters.map((cluster) => {
        const { createdAt: _c, updatedAt: _u, ...fields } = cluster;
        return {
          updateOne: {
            filter: { id: cluster.id, userId: cluster.userId } as any,
            update: {
              $set: { ...(fields as any), updatedAt: now },
              $setOnInsert: { createdAt: now },
            },
            upsert: true,
          },
        };
      });

      await this.graphClusters_col().bulkWrite(operations, {
        ordered: true,
        session: options?.session as any,
      });
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.upsertClusters', err);
    }
  }

  /**
   * 특정 클러스터를 삭제합니다.
   *
   * @param userId 사용자 ID
   * @param clusterId 클러스터 ID
   * @param _permanent 삭제 여부 (현재는 무시됨)
   * @param options (선택) 트랜잭션 옵션
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async deleteCluster(
    userId: string,
    clusterId: string,
    _permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
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
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
   *
   * @param userId 사용자 ID
   * @param clusterId 클러스터 ID
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async findCluster(userId: string, clusterId: string): Promise<GraphClusterDoc | null> {
    try {
      return await this.graphClusters_col().findOne({
        id: clusterId,
        userId,
        deletedAt: { $in: [null, undefined] },
      } as any);
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.findCluster', err);
    }
  }

  /**
   * 특정 사용자의 모든 클러스터 목록을 조회합니다.
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
   * 여러 그래프 서브클러스터를 한 번의 bulkWrite로 생성 또는 갱신합니다.
   *
   * @param subclusters 저장할 서브클러스터 문서 배열
   * @param options (선택) 트랜잭션 세션 등 저장 옵션
   * @returns Promise<void>
   * @remarks
   * - 각 서브클러스터는 `(id, userId)`를 기준으로 upsert 됩니다.
   * - `createdAt`은 신규 삽입 시에만 설정되고, `updatedAt`은 현재 시각으로 일괄 갱신됩니다.
   * - 입력 배열이 비어 있으면 저장을 건너뜁니다.
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async upsertSubclusters(
    subclusters: GraphSubclusterDoc[],
    options?: RepoOptions
  ): Promise<void> {
    try {
      if (subclusters.length === 0) return;

      const now = new Date().toISOString();
      const operations: AnyBulkWriteOperation<GraphSubclusterDoc>[] = subclusters.map(
        (subcluster) => {
          const { createdAt: _c, updatedAt: _u, ...fields } = subcluster;
          return {
            updateOne: {
              filter: { id: subcluster.id, userId: subcluster.userId } as any,
              update: {
                $set: { ...(fields as any), updatedAt: now },
                $setOnInsert: { createdAt: now },
              },
              upsert: true,
            },
          };
        }
      );

      await this.graphSubclusters_col().bulkWrite(operations, {
        ordered: true,
        session: options?.session as any,
      });
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.upsertSubclusters', err);
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
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async restoreSubcluster(
    userId: string,
    subclusterId: string,
    options?: RepoOptions
  ): Promise<void> {
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
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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
   *
   * @param userId - 작업을 요청한 사용자 ID
   * @returns 조회된 통계 문서
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async getStats(userId: string): Promise<GraphStatsDoc | null> {
    try {
      return await this.graphStats_col().findOne({
        userId,
        deletedAt: { $in: [null, undefined] },
      } as any);
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.getStats', err);
    }
  }

  /**
   * 특정 사용자의 그래프 통계를 삭제합니다.
   *
   * @param userId - 작업을 요청한 사용자 ID
   * @param _permanent - 삭제 여부 (현재는 무시됨)
   * @param options - 트랜잭션 옵션
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
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

  /**
   * 그래프 요약 정보를 저장합니다.
   *
   * @param userId - 작업을 요청한 사용자 ID
   * @param summary - 저장할 요약 정보
   * @param options - 트랜잭션 옵션
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
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

  /**
   * 특정 사용자의 그래프 요약 정보를 조회합니다.
   *
   * @param userId - 작업을 요청한 사용자 ID
   * @returns 조회된 요약 정보
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async getGraphSummary(userId: string): Promise<GraphSummaryDoc | null> {
    try {
      const doc = await this.graphSummary_col().findOne({
        userId: userId,
        deletedAt: { $in: [null, undefined] },
      } as any);
      return doc;
    } catch (err: unknown) {
      this.handleError('GraphRepositoryMongo.getGraphSummary', err);
    }
  }

  /**
   * 특정 사용자의 그래프 요약 정보를 삭제합니다.
   *
   * @param userId - 작업을 요청한 사용자 ID
   * @param _permanent - 삭제 여부 (현재는 무시됨)
   * @param options - 트랜잭션 옵션
   * @throws {UpstreamError} - DB 오류 발생 시
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async deleteGraphSummary(
    userId: string,
    _permanent?: boolean,
    options?: RepoOptions
  ): Promise<void> {
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
   * @param _userId - 작업을 요청한 사용자 ID (현재 미사용)
   * @param _options - 트랜잭션 옵션 (현재 미사용)
   * @throws {UpstreamError} 복구가 지원되지 않음을 알림
   */
  /**
   * @deprecated 작성일: 2026-04-27.
   * 원인: Macro Graph의 장기 저장소가 MongoDB에서 Neo4j Native Graph 구조로 이관될 예정입니다.
   * 신규 Macro Graph 런타임 코드에서는 이 Mongo 구현체 메서드를 호출하지 말고 관계 기반 Neo4j 저장소 계층을 사용하십시오.
   * 이 메서드는 마이그레이션 검증, 롤백, 과거 테스트 호환을 위해서만 보존합니다.
   */
  async restoreGraphSummary(_userId: string, _options?: RepoOptions): Promise<void> {
    // [Hard Delete Policy] Restore is no longer supported
    throw new UpstreamError('Restore is not supported in hard-delete only mode');
  }

  /**
   * MongoDB 관련 에러를 처리합니다.
   * @param methodName - 에러가 발생한 메서드 이름
   * @param err - 에러 객체
   * @throws {UpstreamError} - DB 오류 발생 시
   */
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


