import type { UserFileDoc } from '../types/persistence/userFile.persistence';

/**
 * 포트: 사용자 라이브러리 파일 저장소
 *
 * 책임:
 * - `user_files` 컬렉션에 대한 읽기·쓰기 계약을 정의한다.
 * - 서비스 계층은 구현체(`UserFileRepositoryMongo`)를 직접 참조하지 않고 이 인터페이스만 사용한다.
 */
export interface UserFileRepository {
  insert(doc: UserFileDoc): Promise<UserFileDoc>;
  getById(id: string, ownerUserId: string, includeDeleted?: boolean): Promise<UserFileDoc | null>;
  listFiles(
    ownerUserId: string,
    folderId: string | null,
    limit: number,
    cursor?: string
  ): Promise<{ items: UserFileDoc[]; nextCursor: string | null }>;
  /** 동일 폴더에서 표시명 충돌 방지용: 활성 행의 `displayName` 목록 */
  listActiveDisplayNamesInFolder(ownerUserId: string, folderId: string | null): Promise<string[]>;
  updateById(id: string, ownerUserId: string, patch: Partial<UserFileDoc>): Promise<UserFileDoc | null>;
  softDelete(id: string, ownerUserId: string): Promise<boolean>;
  hardDelete(id: string, ownerUserId: string): Promise<boolean>;
  /** 그래프 증분(AddNode) 등: 기준 시각 이후 수정된 활성 파일 */
  findModifiedSince(ownerUserId: string, since: Date): Promise<UserFileDoc[]>;
  /** 매크로 그래프 생성 등: 휴지통 제외 전체 활성 파일 */
  listAllActive(ownerUserId: string): Promise<UserFileDoc[]>;
}
