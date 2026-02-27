import { UpstreamError, NotFoundError } from '../../shared/errors/domain';
import { MicroscopeWorkspaceMetaDoc, MicroscopeDocumentMetaDoc } from '../../core/types/persistence/microscope_workspace.persistence';
import { MicroscopeWorkspaceStore } from '../../core/ports/MicroscopeWorkspaceStore';
import { getMongo } from '../db/mongodb';

/**
 * MongoDB를 저장소로 활용하는 Microscope 워크스페이스 리포지토리 구현체.
 * Microscope 워크스페이스의 메타데이터와 각각의 문서 진행 상태를 저장하고 갱신합니다.
 */
export class MicroscopeWorkspaceRepositoryMongo implements MicroscopeWorkspaceStore {
  /**
   * MongoDB 인스턴스를 가져옵니다. 
   * 앱 실행 시 커넥션 풀을 보장받은 객체를 사용합니다.
   * @throws {Error} DB 초기화 전 호출 시
   */
  private db() {
    const mongo = getMongo();
    if (!mongo) throw new Error('Mongo client not initialized');
    return mongo.db();
  }

  /**
   * Microscope Workspace 메타데이터가 저장되는 MongoDB Collection.
   */
  private microscope_workspaces_collection() {
    return this.db().collection<MicroscopeWorkspaceMetaDoc>('microscope_workspaces');
  }

  /**
   * 새로운 Microscope 워크스페이스(그룹) 메타데이터를 저장합니다.
   * 
   * @param workspace 워크스페이스 엔티티. _id 필드는 Neo4j의 group_id 및 식별자로 활용됩니다.
   * @throws {UpstreamError} MICRO_WORKSPACE_CREATE_FAIL DB 저장 실패 시 원인 로깅
   * @example
   * await repo.createWorkspace({ _id: "uuid1", userId: "user1", ... });
   */
  async createWorkspace(workspace: MicroscopeWorkspaceMetaDoc): Promise<void> {
    try {
      await this.microscope_workspaces_collection().insertOne(workspace as any);
    } catch (err: unknown) {
      throw new UpstreamError('MicroscopeWorkspaceRepositoryMongo.createWorkspace failed', { cause: String(err) });
    }
  }

  /**
   * 워크스페이스의 식별자(groupId)로 엔티티를 조회합니다.
   * 
   * @param groupId 워크스페이스 UUID (Neo4j의 group_id)
   * @returns 조회된 워크스페이스 또는 존재하지 않을 경우 null
   * @throws {UpstreamError} MICRO_WORKSPACE_READ_FAIL DB 읽기 실패 시
   */
  async findById(groupId: string): Promise<MicroscopeWorkspaceMetaDoc | null> {
    try {
      const doc = await this.microscope_workspaces_collection().findOne({ _id: groupId } as any);
      return doc ? (doc as unknown as MicroscopeWorkspaceMetaDoc) : null;
    } catch (err: unknown) {
      throw new UpstreamError('MicroscopeWorkspaceRepositoryMongo.findById failed', { cause: String(err) });
    }
  }

  /**
   * 특정 유저가 생성한 모든 워크스페이스 목록을 생성일 최신순으로 조회합니다.
   * 
   * @param userId 유저 ID
   * @returns 워크스페이스 배열 (최신순 정렬)
   * @throws {UpstreamError} MICRO_WORKSPACE_READ_FAIL DB 읽기 실패 시
   */
  async findByUserId(userId: string): Promise<MicroscopeWorkspaceMetaDoc[]> {
    try {
      const docs = await this.microscope_workspaces_collection().find({ userId }).sort({ createdAt: -1 }).toArray();
      return docs as unknown as MicroscopeWorkspaceMetaDoc[];
    } catch (err: unknown) {
      throw new UpstreamError('MicroscopeWorkspaceRepositoryMongo.findByUserId failed', { cause: String(err) });
    }
  }

  /**
   * 워크스페이스를 삭제(Hard Delete)합니다.
   * 워크스페이스 하위의 문서 및 진행 상태(documents 배열)도 함께 소멸됩니다.
   * 
   * @param groupId 워크스페이스 UUID
   * @throws {UpstreamError} MICRO_WORKSPACE_DELETE_FAIL DB 삭제 쿼리 실패 시
   * @remarks 
   * - 서비스 계층에서 Neo4j 그래프 데이터를 지운 뒤 호출하는 것이 안전합니다.
   */
  async deleteWorkspace(groupId: string): Promise<void> {
    try {
      await this.microscope_workspaces_collection().deleteOne({ _id: groupId } as any);
    } catch (err: unknown) {
      throw new UpstreamError('MicroscopeWorkspaceRepositoryMongo.deleteWorkspace failed', { cause: String(err) });
    }
  }

  /**
   * 기존 워크스페이스 하위에 새로운 문서 기록(MicroscopeDocumentMetaDoc) 1개를 추가합니다.
   * 
   * @param groupId 문서가 속할 대상 워크스페이스 식별자
   * @param doc 새로 저장될 문서 정보 객체 (PENDING 상태 권장)
   * @throws {NotFoundError} MICRO_WORKSPACE_NOT_FOUND 대상 groupId가 존재하지 않을 때
   * @throws {UpstreamError} MICRO_DOCUMENT_ADD_FAIL 배열 삽입 트랜잭션 실패 시
   * @remarks
   * - $push 연산자를 사용하여 DB 레벨에서 원자적으로 Array 요소가 추가됩니다.
   * - 워크스페이스 자체의 updatedAt 도 함께 갱신됩니다.
   */
  async addDocument(groupId: string, doc: MicroscopeDocumentMetaDoc): Promise<void> {
    try {
      const result = await this.microscope_workspaces_collection().updateOne(
        { _id: groupId } as any,
        {
          $push: { documents: doc } as any,
          $set: { updatedAt: new Date().toISOString() }
        }
      );
      if (result.matchedCount === 0) {
        throw new NotFoundError(`Microscope workspace ${groupId} not found`);
      }
    } catch (err: unknown) {
      if (err instanceof NotFoundError) throw err;
      throw new UpstreamError('MicroscopeWorkspaceRepositoryMongo.addDocument failed', { cause: String(err) });
    }
  }

  /**
   * 워크스페이스 내에 존재하는 특정 문서의 상태(PENDING/COMPLETED/등)를 업데이트합니다.
   * SQS 워커가 AI 모델 처리를 마치고 결과를 줄당 시 이 메서드로 성공/실패 값을 갱신합니다.
   * 
   * @param groupId 워크스페이스 UUID
   * @param docId 문서를 식별하는 기준이 되는 문서 식별 ID (taskId)
   * @param status 변경될 AI 처리 상태
   * @param sourceId (optional) Graph가 생성되었으면 Graph Node/Chunk와 연결하기 위한 sourceId
   * @param error (optional) 실패 시 반환받은 에러 메시지
   * @throws {NotFoundError} MICRO_WORKSPACE_NOT_FOUND 대상 워크스페이스 또는 문서(docId)를 찾지 못할 때
   * @throws {UpstreamError} MICRO_DOCUMENT_UPDATE_FAIL 배열 내부 요소를 수정하다가 실패할 시
   * @remarks
   * - MongoDB의 위치 연산자 (`$`)를 활용하여 documents 배열 내에서 `id` 매칭 대상 1건의 속성만 정확히 갱신합니다.
   * - 상위 워크스페이스 및 하위 문서 양쪽의 업데이트 날짜(updatedAt)를 동시 기록합니다.
   */
  async updateDocumentStatus(
    groupId: string,
    docId: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    sourceId?: string,
    error?: string,
  ): Promise<void> {
    try {
      const updateFields: any = {
        'documents.$.status': status,
        'documents.$.updatedAt': new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      if (sourceId) {
        updateFields['documents.$.sourceId'] = sourceId;
      }
      if (error) {
        updateFields['documents.$.error'] = error;
      }

      const result = await this.microscope_workspaces_collection().updateOne(
        { _id: groupId, 'documents.id': docId } as any,
        { $set: updateFields }
      );

      if (result.matchedCount === 0) {
        throw new NotFoundError(`Microscope workspace document not found for groupId=${groupId} and docId=${docId}`);
      }
    } catch (err: unknown) {
      if (err instanceof NotFoundError) throw err;
      throw new UpstreamError('MicroscopeWorkspaceRepositoryMongo.updateDocumentStatus failed', { cause: String(err) });
    }
  }
}
