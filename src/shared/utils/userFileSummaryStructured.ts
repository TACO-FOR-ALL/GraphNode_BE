import type { UserFileSummaryStructured } from '../types/userFileSummaryStructured';

/**
 * BCP-47 로케일을 요약 생성 언어 라벨로 매핑한다.
 * @param locale `UserService.getPreferredLanguage` 등에서 오는 값
 */
export function localeToUserFileSummaryGenerationLanguage(
  locale: string
): 'Korean' | 'English' | 'Chinese' {
  const l = locale.trim().toLowerCase();
  if (l.startsWith('ko')) return 'Korean';
  if (l.startsWith('zh')) return 'Chinese';
  return 'English';
}

function stripJsonFences(raw: string): string {
  let t = raw.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '');
    if (t.endsWith('```')) {
      t = t.slice(0, -3).trim();
    }
  }
  return t;
}

/**
 * LLM 응답 문자열에서 구조화 요약을 파싱·검증한다.
 * @param raw 모델 출력 (JSON 단독 또는 ```json 펜스 포함 가능)
 */
export function parseUserFileSummaryStructured(
  raw: string
): { ok: true; data: UserFileSummaryStructured } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(raw));
  } catch {
    return { ok: false, error: '요약 JSON 파싱에 실패했습니다.' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: '요약 JSON 형식이 올바르지 않습니다.' };
  }
  const o = parsed as Record<string, unknown>;
  const oneLine = typeof o.oneLine === 'string' ? o.oneLine.trim() : '';
  const purpose = typeof o.purpose === 'string' ? o.purpose.trim() : '';
  const conclusion = typeof o.conclusion === 'string' ? o.conclusion.trim() : '';
  const kp = o.keyPoints;
  const keyPoints = Array.isArray(kp)
    ? kp.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
    : [];
  if (!oneLine) {
    return { ok: false, error: '요약 JSON에 oneLine이 비어 있습니다.' };
  }
  if (!purpose) {
    return { ok: false, error: '요약 JSON에 purpose가 비어 있습니다.' };
  }
  if (keyPoints.length < 1) {
    return { ok: false, error: '요약 JSON에 keyPoints가 비어 있습니다.' };
  }
  if (!conclusion) {
    return { ok: false, error: '요약 JSON에 conclusion이 비어 있습니다.' };
  }
  return {
    ok: true,
    data: { oneLine, purpose, keyPoints, conclusion },
  };
}
