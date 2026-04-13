/**
 * 모듈: HMAC-signed OAuth State 유틸리티
 * 책임: 저장소 없이 Apple OAuth CSRF 방어용 state 토큰을 생성·검증한다.
 *
 * 공개 인터페이스:
 *   - createOauthState()  : 서명된 state 문자열 생성
 *   - verifyOauthState()  : state 서명 + 만료 검증
 *
 * 형식: base64url(payload_json) + "." + base64url(HMAC-SHA256(payload, SESSION_SECRET))
 * 만료: SESSION_STATE_MAX_AGE_SECONDS (기본 10분)
 *
 * 다중 인스턴스 안전: SESSION_SECRET이 모든 인스턴스에서 동일하면
 * 어느 인스턴스가 콜백을 처리하더라도 검증 성공.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

/** state 유효 기간(초). Apple Authorization code 만료(10분)와 동일하게 설정. */
const STATE_MAX_AGE_SECONDS = 10 * 60;

function getSecret(): string {
  return process.env.SESSION_SECRET || 'dev-secret-change-me';
}

/**
 * HMAC-SHA256 서명된 OAuth state 토큰을 생성한다.
 * @description
 *   payload = { nonce: UUIDv4, iat: Unix seconds }
 *   token   = base64url(payload_json) + "." + base64url(HMAC-SHA256(payload_b64, secret))
 * @returns 서명된 state 문자열. Apple Authorization URL의 state 파라미터로 사용.
 * @example
 *   const state = createOauthState();
 *   const url = svc.buildAuthUrl(state);
 */
export function createOauthState(): string {
  const payload = JSON.stringify({
    nonce: randomUUID(),
    iat: Math.floor(Date.now() / 1000),
  });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * HMAC-signed state 토큰의 서명과 만료를 검증한다.
 * @description
 *   1. 서명 재계산 후 timing-safe 비교
 *   2. iat 기반 만료 확인 (STATE_MAX_AGE_SECONDS)
 * @param state Apple 콜백 body에서 수신한 state 문자열
 * @returns 서명이 유효하고 만료되지 않았으면 true, 그렇지 않으면 false
 * @example
 *   if (!verifyOauthState(state)) throw new ValidationError('Invalid state');
 */
export function verifyOauthState(state: string): boolean {
  const dotIdx = state.lastIndexOf('.');
  if (dotIdx === -1) return false;

  const payloadB64 = state.slice(0, dotIdx);
  const receivedSig = state.slice(dotIdx + 1);

  // 서명 재계산 후 timing-safe 비교 (timing attack 방지)
  const expectedSig = createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
  try {
    const a = Buffer.from(receivedSig, 'base64url');
    const b = Buffer.from(expectedSig, 'base64url');
    if (a.length !== b.length) return false;
    if (!timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }

  // 만료 확인
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as {
      nonce: string;
      iat: number;
    };
    const ageSeconds = Math.floor(Date.now() / 1000) - payload.iat;
    if (ageSeconds < 0 || ageSeconds > STATE_MAX_AGE_SECONDS) return false;
  } catch {
    return false;
  }

  return true;
}
