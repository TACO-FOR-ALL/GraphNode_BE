/**
 * 모듈: 사용자 라이브러리 파일 업로드 정책
 *
 * 책임:
 * - 허용 확장자·MIME 매핑을 한곳에서 관리한다.
 * - MVP는 문서류만 허용하고, `UserFileCategory`로 이미지 등 확장을 열어 둔다.
 */
export type UserFileCategory = 'document';

/** MVP에서 허용하는 문서 확장자(소문자, 점 포함) */
export const USER_FILE_DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.ppt', '.pptx'] as const;

const DOCUMENT_EXT_SET = new Set<string>(USER_FILE_DOCUMENT_EXTENSIONS);

/** 확장자별 기본 Content-Type (S3 업로드·응답 헤더 참고) */
const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/** 파일명으로 카테고리를 추론한다. 허용되지 않으면 `null`. */
export function inferUserFileCategory(originalName: string): UserFileCategory | null {
  const ext = extnameLower(originalName);
  if (DOCUMENT_EXT_SET.has(ext)) return 'document';
  return null;
}

/**
 * 업로드 허용 여부를 검사한다.
 * @throws 허용 목록에 없는 확장자인 경우 (메시지는 호출부에서 `ValidationError`로 감쌀 수 있음)
 */
export function assertAllowedUserFile(originalName: string): { category: UserFileCategory; ext: string } {
  const category = inferUserFileCategory(originalName);
  if (!category) {
    throw new Error(
      `지원하지 않는 파일 형식입니다. 허용: ${USER_FILE_DOCUMENT_EXTENSIONS.join(', ')}`
    );
  }
  return { category, ext: extnameLower(originalName) };
}

/** 확장자에 대응하는 MIME이 없으면 `application/octet-stream` */
export function defaultMimeForUserFile(ext: string): string {
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/** 소문자 확장자 (예: `.pdf`). 확장자 없으면 빈 문자열 */
function extnameLower(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0) return '';
  return name.slice(i).toLowerCase();
}
