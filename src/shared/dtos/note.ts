/**
 * 모듈: 노트/폴더 데이터 공통 DTO
 *
 * 책임:
 * - FE-BE 간 노트 및 폴더 데이터 교환을 위한 표준 인터페이스를 정의합니다.
 * - 클라이언트와 서버가 주고받는 데이터의 형태를 강제합니다.
 *
 * 외부 의존: 없음 (순수 타입 모듈)
 */

/**
 * 노트 정보 DTO
 *
 * @public
 * @property id 노트 고유 ID (UUID)
 * @property ownerUserId 소유자 사용자 ID
 * @property title 노트 제목
 * @property content 노트 내용 (Markdown)
 * @property folderId 소속 폴더 ID (null이면 최상위)
 * @property createdAt 생성 일시 (ISO 8601 문자열)
 * @property updatedAt 수정 일시 (ISO 8601 문자열)
 * @property deletedAt 삭제 일시 (ISO 8601 문자열, null이면 활성 상태)
 */
export interface Note {
  /** 노트 고유 ID (UUID) */
  id: string;
  /** 노트 제목 */
  title: string;
  /** 노트 내용 (Markdown) */
  content: string;
  /** 소속 폴더 ID (null이면 최상위) */
  folderId: string | null;
  /** 생성 일시 (ISO 8601 문자열) */
  createdAt: string;
  /** 수정 일시 (ISO 8601 문자열) */
  updatedAt: string;
  /** 삭제 일시 (ISO 8601 문자열, null이면 활성) */
  deletedAt?: string | null;
}

/**
 * 폴더 정보 DTO
 *
 * @public
 * @property id 폴더 고유 ID (UUID)
 * @property ownerUserId 소유자 사용자 ID
 * @property name 폴더 이름
 * @property parentId 상위 폴더 ID (null이면 최상위)
 * @property createdAt 생성 일시 (ISO 8601 문자열)
 * @property updatedAt 수정 일시 (ISO 8601 문자열)
 * @property deletedAt 삭제 일시 (ISO 8601 문자열, null이면 활성 상태)
 */
export interface Folder {
  /** 폴더 고유 ID (UUID) */
  id: string;
  /** 폴더 이름 */
  name: string;
  /** 상위 폴더 ID (null이면 최상위) */
  parentId: string | null;
  /** 생성 일시 (ISO 8601 문자열) */
  createdAt: string;
  /** 수정 일시 (ISO 8601 문자열) */
  updatedAt: string;
  /** 삭제 일시 (ISO 8601 문자열, null이면 활성) */
  deletedAt?: string | null;
}
