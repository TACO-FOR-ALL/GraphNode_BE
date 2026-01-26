/**
 * 모듈: 노트/폴더 Persistence Types
 * 책임: MongoDB에 저장되는 문서(Document)의 구조를 정의한다.
 *
 * - 이 타입들은 Repository 계층 내부에서만 사용되어야 하며,
 *   Service 계층 밖으로 노출될 때는 DTO로 변환되어야 한다.
 */

/**
 * MongoDB 'notes' 컬렉션 문서 타입
 * @internal
 * @property _id 문서 고유 ID (UUID)
 * @property ownerUserId 소유자 사용자 ID
 * @property title 노트 제목
 * @property content 노트 내용 (Markdown)
 * @property folderId 소속 폴더 ID (null이면 최상위)
 * @property createdAt 생성 일시
 * @property updatedAt 수정 일시
 * @property deletedAt 삭제 일시
 */
export interface NoteDoc {
  /** 문서 고유 ID (UUID) */
  _id: string;
  /** 소유자 사용자 ID */
  ownerUserId: string;
  /** 노트 제목 */
  title: string;
  /** 노트 내용 (Markdown) */
  content: string;
  /** 소속 폴더 ID (null이면 최상위) */
  folderId: string | null;
  /** 생성 일시 */
  createdAt: Date;
  /** 수정 일시 */
  updatedAt: Date;
  /** 삭제 일시 (null이면 활성) */
  deletedAt?: Date | null;
}

/**
 * MongoDB 'folders' 컬렉션 문서 타입
 * @internal
 * @property _id 문서 고유 ID (UUID)
 * @property ownerUserId 소유자 사용자 ID
 * @property name 폴더 이름
 * @property parentId 상위 폴더 ID (null이면 최상위)
 * @property createdAt 생성 일시
 * @property updatedAt 수정 일시
 * @property deletedAt 삭제 일시
 */
export interface FolderDoc {
  /** 문서 고유 ID (UUID) */
  _id: string;
  /** 소유자 사용자 ID */
  ownerUserId: string;
  /** 폴더 이름 */
  name: string;
  /** 상위 폴더 ID (null이면 최상위) */
  parentId: string | null;
  /** 생성 일시 */
  createdAt: Date;
  /** 수정 일시 */
  updatedAt: Date;
  /** 삭제 일시 */
  deletedAt?: Date | null;
}
