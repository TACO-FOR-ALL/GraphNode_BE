import { Readable } from 'stream';

export interface StoragePort {
  /**
   * 데이터를 스토리지에 업로드합니다.
   * @param key 저장할 파일 키 (경로 포함)
   * @param body 저장할 데이터 (문자열, 버퍼, 또는 읽기 가능한 스트림)
   * @param contentType MIME 타입 (기본 application/json)
   */
  upload(key: string, body: string | Buffer | Readable, contentType?: string): Promise<void>;

  /**
   * JSON 객체를 업로드하는 편의 메서드입니다.
   * @param key 저장할 파일 키
   * @param data 저장할 JSON 객체
   */
  uploadJson(key: string, data: unknown): Promise<void>;

  /**
   * 스토리지에서 데이터를 다운로드하여 스트림으로 반환합니다.
   * @param key 파일 키
   */
  downloadStream(key: string): Promise<Readable>;

  /**
   * 스토리지에서 JSON 파일을 다운로드하여 파싱된 객체로 반환합니다.
   * @param key 파일 키
   */
  downloadJson<T>(key: string): Promise<T>;

  /**
   * 스토리지에서 파일을 삭제합니다.
   * @param key 파일 키
   */
  delete(key: string): Promise<void>;
}
