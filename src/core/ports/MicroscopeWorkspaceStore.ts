import { MicroscopeWorkspaceMetaDoc, MicroscopeDocumentMetaDoc } from '../types/persistence/microscope_workspace.persistence';

/**
 * Microscope 워크스페이스 메타데이터 관리를 위한 DB Port.
 * 진행 상태 기록 및 파일 목록 유지를 담당합니다.
 */
export interface MicroscopeWorkspaceStore {
  /**
   * 새 워크스페이스 메타데이터를 저장합니다.
   * @param workspace 워크스페이스 메타데이터 객체
   */
  createWorkspace(workspace: MicroscopeWorkspaceMetaDoc): Promise<void>;

  /**
   * 워크스페이스 ID(group_id)로 메타데이터를 조회합니다.
   * @param groupId 워크스페이스 고유 식별자
   */
  findById(groupId: string): Promise<MicroscopeWorkspaceMetaDoc | null>;

  /**
   * 유저 ID가 소유한 워크스페이스 목록을 조회합니다.
   * @param userId 유저 고유 식별자
   */
  findByUserId(userId: string): Promise<MicroscopeWorkspaceMetaDoc[]>;

  /**
   * 특정 워크스페이스와 하위 문서 트래킹 기록을 데이터베이스에서 삭제합니다.
   * @param groupId 워크스페이스 고유 식별자
   */
  deleteWorkspace(groupId: string): Promise<void>;

  /**
   * 워크스페이스에 새로운 문서 처리 요청 건을 추가(등록)합니다.
   * @param groupId 대상 워크스페이스 ID
   * @param document 진행 상태를 기록할 새 문서 객체
   */
  addDocument(groupId: string, document: MicroscopeDocumentMetaDoc): Promise<void>;

  /**
   * 워크스페이스의 특정 문서 상태(status) 및 sourceId를 갱신합니다.
   * @param groupId 대상 워크스페이스 ID
   * @param docId 상태를 갱신할 문서의 고유 ID (생성 시 발급한 taskId)
   * @param status 변경할 상태값
   * @param sourceId 성공 시 발급받은 문서 고유 식별자 (옵션)
   * @param error 실패 시 에러 사유 (옵션)
   */
  updateDocumentStatus(
    groupId: string,
    docId: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    sourceId?: string,
    error?: string
  ): Promise<void>;
}
