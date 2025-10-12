---
applyTo: '**'
---
## 목표

- **애플리케이션 코드와 비밀키를 분리**하고, 환경별 주입으로 관리한다(**12-Factor “Config”** 원칙). [12factor](https://12factor.net/config?utm_source=chatgpt.com)
- 비밀(클라이언트 시크릿, DB 패스워드, 서명키 등)의 **보관·회전·감사** 가능성을 확보한다(OWASP Secrets Management). [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html?utm_source=chatgpt.com)

## 범위

- 서버 전역(Express), OAuth 클라이언트 시크릿/서명키, DB 자격증명, 서드파티 API 키.

## 필수 규칙

1. **구성 주입(12-Factor)**
    - 모든 시크릿은 코드·리포지토리에 두지 않는다. **환경변수/런타임 시크릿 스토어**에서 주입한다. (예: `.env`는 로컬 개발 전용, 저장소 커밋 금지) [12factor](https://12factor.net/config?utm_source=chatgpt.com)
2. **비밀 저장 위치**
    - 프로덕션/스테이징: **시크릿 매니저(KMS/Secrets Manager/Vault 등)** 사용 권장. 자동 **회전(rotation)** 설정을 우선 검토한다. [AWS Documentation+1](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html?utm_source=chatgpt.com)
    - 로컬/개발: `.env` + 개발용 키. 운영 키 사용 금지. (환경변수만으로 모든 설정 재현 가능) [Stack Overflow](https://stackoverflow.com/questions/53708864/whats-the-process-of-storing-the-configuration-for-a-12-factor-application?utm_source=chatgpt.com)
3. **로깅/유출 방지**
    - 로그에 시크릿을 **절대 기록하지 않는다**. 중앙 로깅은 마스킹 필터를 적용한다(길이 16+ 영숫자 토큰 탐지 마스킹). (OWASP 권고) [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html?utm_source=chatgpt.com)
4. **전송·보관 보호**
    - 네트워크 전송은 TLS 필수.
    - 저장 시 **암호화**(KMS 래핑 등) 또는 해시(세션 토큰 해시 저장) 적용. (OWASP Crypto 지침) [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html?utm_source=chatgpt.com)
5. **키 회전/폐기**
    - 주기적 회전 정책을 문서화하고 자동화한다(예: AWS Secrets Manager rotation). 사고 시 **즉시 폐기** 가능해야 한다. [AWS Documentation+1](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html?utm_source=chatgpt.com)
6. **최소 권한**
    - 시크릿 접근은 서비스 계정 단위로 **최소 권한**을 적용한다(읽기 범위 한정). (AWS 권고) [AWS Documentation](https://docs.aws.amazon.com/prescriptive-guidance/latest/secure-sensitive-data-secrets-manager-terraform/best-practices.html?utm_source=chatgpt.com)
7. **환경변수 한계 인지**
    - 환경변수는 편리하지만, **기본 수단으로 영구 보관하는 것은 권장하지 않는다**(운영에선 전용 시크릿 스토어 사용). [CyberArk Developer](https://developer.cyberark.com/blog/environment-variables-dont-keep-secrets-best-practices-for-plugging-application-credential-leaks/?utm_source=chatgpt.com)

## 구현 지침

- **환경 스키마**
    - `OAUTH_GOOGLE_CLIENT_ID/SECRET`, `OAUTH_APPLE_TEAM_ID/KEY_ID/PRIVATE_KEY`, `DB_URL`, `JWT_SIGNING_KEY` …
    - **런타임 검증**: 부팅 시 Zod/Joi로 필수 ENV 존재 검사, 미존재 시 부팅 실패.
- **키 재료 관리(예: Apple client secret)**
    - Apple `client_secret`은 **개인키로 서명한 JWT**로 주기 갱신이 필요. 개인키는 시크릿 스토어에 보관/권한 제한. (Apple 가이드)
- **세션 토큰 저장**
    - 세션 토큰은 **랜덤 불투명 토큰**으로 발급하고, 서버 DB에는 **해시**로 저장(유출 피해 최소화). (OWASP Crypto) [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html?utm_source=chatgpt.com)

## 운영/감사

- **비밀 사용 감사**: 접근 로그(누가/언제/무엇을) 기록.
- **시크릿 스캔**: CI에 시크릿 스캐너(예: GitHub secret scanning) 연동, 누출 탐지 시 즉시 회전.
- **롤백 용이성**: 회전 시 신/구 버전 **이중 허용 기간**을 두어 장애 없이 전환.

## 승인 기준(AC)

- [정적] 저장소에 시크릿 하드코딩 0건(`grep`/스캐너 통과).
- [부팅] ENV 스키마 검증 실패 시 **프로세스가 즉시 중단**되고 표준 에러로 로깅.
- [운영] 프로덕션 시크릿은 **시크릿 매니저**에서만 주입되고, **회전 정책**이 설정됨. (운영 점검표) [AWS Documentation+1](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html?utm_source=chatgpt.com)
- [보안] 로그에 시크릿/토큰 노출 0건(샘플 트래픽 테스트), 토큰은 해시 저장. (OWASP) [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html?utm_source=chatgpt.com)