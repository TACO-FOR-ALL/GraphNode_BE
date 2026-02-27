/**
 * Microscope 워크스페이스 메타데이터 및 진행 상태를 MongoDB에서 추적하기 위한 영속성 스키마입니다.
 * 이 구조는 실제 그래프 데이터(Neo4j)를 보관하지 않으며, 오직 "어떤 파일들이 속해있고, AI 처리가 끝났는지"만을 추적합니다.
 */

export type MicroscopeDocumentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * 개별 업로드 문서의 메타데이터 및 상태
 * @property id 내부 고유 식별자 (ULID) - 
 * @property s3Key 원본 파일의 S3 경로
 * @property fileName 사용자에게 보여질 원본 파일명
 * @property status AI 워커 처리 상태
 * @property sourceId AI 워커 처리가 성공하면 부여되는 고유 문서 식별자 (Neo4j에 매핑됨)
 * @property error 실패 시의 에러 원인
 * @property createdAt 등록 일시
 * @property updatedAt 최종 상태 변경 일시
 */
export interface MicroscopeDocumentMetaDoc {
  id: string;
  s3Key: string;
  fileName: string;
  status: MicroscopeDocumentStatus;
  sourceId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 워크스페이스(그룹) 메타데이터 저장 구조
 * @property _id 워크스페이스의 논리적 식별자 (ULID/UUID). = Neo4j의 group_id
 * @property userId 소유 유저 식별자
 * @property name 워크스페이스 이름
 * @property documents 업로드된 파일들의 목록 및 개별 처리 상태
 * @property createdAt 생성 일시
 * @property updatedAt 최종 수정 일시
 */
export interface MicroscopeWorkspaceMetaDoc {
  _id: string;
  userId: string;
  name: string;
  documents: MicroscopeDocumentMetaDoc[];
  createdAt: string;
  updatedAt: string;
}
