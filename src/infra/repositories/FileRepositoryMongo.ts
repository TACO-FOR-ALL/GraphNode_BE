/**
 * 레거시 노트–파일 링크용 Mongo 저장소 자리 표시자입니다.
 *
 * 일부 API 스펙이 `jest.mock(.../FileRepositoryMongo)` 로 이 모듈을 가로채며,
 * 실제 애플리케이션 경로에서는 현재 주입되지 않습니다(MVP 사용자 파일은 `UserFileRepositoryMongo`).
 */
export class FileRepositoryMongo {
  async listFilesLinkedToActiveNotes(): Promise<unknown[]> {
    return [];
  }

  async listFilesForIncrementalAddNode(): Promise<unknown[]> {
    return [];
  }

  async softDeleteLinksByNoteId(_noteId: string, _ownerUserId: string): Promise<number> {
    return 0;
  }

  async insertFile(): Promise<never> {
    throw new Error('이 빌드에서는 FileRepositoryMongo.insertFile 이 연결되어 있지 않습니다.');
  }

  async getFileById(): Promise<null> {
    return null;
  }

  async existsActiveDisplayName(): Promise<boolean> {
    return false;
  }

  async softDeleteFile(): Promise<boolean> {
    return true;
  }

  async hardDeleteFile(): Promise<boolean> {
    return true;
  }

  async updateFileSummary(): Promise<boolean> {
    return true;
  }

  async insertLink(): Promise<never> {
    throw new Error('이 빌드에서는 FileRepositoryMongo.insertLink 가 연결되어 있지 않습니다.');
  }

  async getLinkById(): Promise<null> {
    return null;
  }

  async findActiveLink(): Promise<null> {
    return null;
  }

  async listLinksWithFilesByNoteId(): Promise<unknown[]> {
    return [];
  }

  async softDeleteLink(): Promise<boolean> {
    return true;
  }

  async hardDeleteLink(): Promise<boolean> {
    return true;
  }
}
