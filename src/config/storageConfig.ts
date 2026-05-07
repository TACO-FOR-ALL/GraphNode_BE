/**
 * 모듈: S3 스토리지 경로 레지스트리 (Storage Path Registry)
 *
 * 책임:
 * - S3 물리 경로(prefix)와 외부 노출 API 경로(proxyRoute)를 한 곳에서 관리한다.
 * - 새 파일 카테고리 추가 시 이 파일의 항목 1개만 추가하면
 *   S3 key 생성과 파일 조회 API 노출이 동시에 해결된다.
 *
 * 사용 패턴:
 * ```ts
 * import { STORAGE_BUCKETS, buildStorageKey } from '../../config/storageConfig';
 * const key = buildStorageKey(STORAGE_BUCKETS.CHAT_FILES, `${uuid}-${date}${ext}`);
 * ```
 */

/**
 * 스토리지 버킷 설정 타입.
 *
 * @property prefix      S3 물리 경로 prefix (슬래시 미포함)
 * @property proxyRoute  파일 프록시 라우터 마운트 경로. null이면 별도 API 엔드포인트로만 접근
 */
export interface StorageBucketConfig {
  prefix: string;
  proxyRoute: string | null;
}

/**
 * 프로젝트 전체 스토리지 버킷 레지스트리.
 *
 * - `prefix`   : S3 key 생성 시 사용하는 경로 접두사 (끝에 '/' 없음)
 * - `proxyRoute`: `server.ts`에서 자동으로 파일 프록시 라우터가 마운트될 경로.
 *                 `null`이면 해당 prefix는 별도 전용 엔드포인트(`/api/v1/ai/files`)를 통해서만 접근된다.
 *
 * 파일 조회는 인증 없이 공개 접근을 허용한다.
 */
export const STORAGE_BUCKETS = {
  FEEDBACK_FILES: {
    prefix: 'feedback-files',
    proxyRoute: '/feedback-files',
  },
  CHAT_FILES: {
    prefix: 'chat-files',
    proxyRoute: '/chat-files',
  },
  SDK_FILES: {
    prefix: 'sdk-files',
    proxyRoute: '/sdk-files',
  },
  /** AI 이미지 생성 결과. 전용 스트리밍 API(/api/v1/ai/files)로 서빙하므로 proxyRoute 없음. */
  AI_GENERATED: {
    prefix: 'ai-generated',
    proxyRoute: null,
  },
  /** 사용자 라이브러리 원본(문서). 프록시 URL은 S3 prefix와 동일 규칙을 따른다. */
  USER_FILES: {
    prefix: 'user-files',
    proxyRoute: '/user-files',
  },
} as const satisfies Record<string, StorageBucketConfig>;

/**
 * S3 Key를 생성한다.
 *
 * @param bucket   STORAGE_BUCKETS 항목
 * @param filename prefix 이후의 파일명 부분 (예: `${uuid}-${date}.png`)
 * @returns        완성된 S3 key 문자열 (예: `chat-files/uuid-20250423.jpg`)
 * @example
 * const key = buildStorageKey(STORAGE_BUCKETS.CHAT_FILES, `${uuidv4()}-${date}${ext}`);
 */
export function buildStorageKey(bucket: StorageBucketConfig, filename: string): string {
  return `${bucket.prefix}/${filename}`;
}
