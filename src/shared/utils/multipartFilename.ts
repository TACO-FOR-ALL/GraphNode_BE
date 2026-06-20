/**
 * multipart 업로드 시 파일명 인코딩 복구.
 *
 * multer/busboy는 Content-Disposition `filename`을 latin1로 해석하는 경우가 있어
 * UTF-8 한글 파일명이 `æ´...` 형태의 mojibake로 저장될 수 있다.
 * 클라이언트가 UTF-8 `displayName` 필드를내면 우선 사용하고,
 * 없으면 latin1→utf8 복구 휴리스틱을 적용한다.
 */

function hasCjk(text: string): boolean {
  return /[\u3000-\u9fff\uac00-\ud7af]/.test(text);
}

/** multer `originalname` latin1 오해석 복구 시도 */
export function repairMultipartFilename(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (hasCjk(trimmed)) return trimmed;

  const utf8Candidate = Buffer.from(trimmed, 'latin1').toString('utf8');
  if (hasCjk(utf8Candidate)) return utf8Candidate;

  return trimmed;
}

/** 업로드 요청에서 최종 표시 파일명 결정 */
export function resolveUploadFilename(
  explicitDisplayName: unknown,
  multerOriginalName: string | undefined
): string {
  if (typeof explicitDisplayName === 'string') {
    const trimmed = explicitDisplayName.trim();
    if (trimmed) return trimmed;
  }

  const fallback = multerOriginalName?.trim() || 'upload.bin';
  return repairMultipartFilename(fallback);
}
