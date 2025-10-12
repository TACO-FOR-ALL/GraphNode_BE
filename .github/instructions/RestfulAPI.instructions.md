---
applyTo: '**'
---
## 목표

- 모든 서버 엔드포인트는 **자원(Resource) 중심의 RESTful 설계**를 따른다. URI는 자원을 표현하고, **행위는 HTTP 메서드**로 표현한다. 이로써 일관성·캐싱·확장성의 이점을 확보한다. [ics.uci.edu](https://www.ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm?utm_source=chatgpt.com)
- HTTP 의미론(메서드/상태코드/헤더)은 **RFC 9110**을 준수한다. [datatracker.ietf.org](https://datatracker.ietf.org/doc/html/rfc9110?utm_source=chatgpt.com)

## 범위

- API 서버(Express) 전 구간. 내부/외부 소비자 공통 규범.
- 에러 응답 형식은 **명령문 파일 2(중앙 로깅·에러 표준화)**의 RFC 7807 방식을 따른다. [datatracker.ietf.org+1](https://datatracker.ietf.org/doc/html/rfc7807?utm_source=chatgpt.com)

---

## 필수 규칙

### 1) 자원 모델링

- **명사형 복수 자원**을 1급 시민으로 노출한다. 예)
    - `/users`, `/conversations`, `/messages`, `/graph/nodes`, `/graph/edges`
- **관계/중첩**은 하위 경로로 노출할 수 있으나, **고유 ID가 있으면 상위 컬렉션 경로도 제공**한다. 예)
    - `/conversations/{id}/messages`와 `/messages/{id}`를 **둘 다** 제공(탐색성과 직결).
- **서버 행위**는 **메서드/서브리소스/상태전이**로 표현하고, **동사형 URI 금지**(예: `/createMessage` 금지). 가이드라인에 부합. [GitHub+1](https://github.com/microsoft/api-guidelines?utm_source=chatgpt.com)

### 2) URI 규칙 & 식별자

- **스네이크/카멜 금지**: 경로는 **kebab-case**, 쿼리는 **lowerCamel** 권장(일관성).
- 리소스 식별자는 **불변 ID**(ULID/UUID) 사용. 자연키 노출 지양.

### 3) HTTP 메서드 의미(요약)

- `GET /resources` : 조회(부작용 X).
- `GET /resources/{id}` : 단건 조회.
- `POST /resources` : **신규 생성**(201 Created + `Location` 헤더).
- `PUT /resources/{id}` : **전체 교체**(없으면 404 또는 201 결정 정책 명시).
- `PATCH /resources/{id}` : **부분 갱신**(JSON Patch/merge-patch 중 택1 문서화).
- `DELETE /resources/{id}` : 삭제(204).
- **비동기 작업**은 `202 Accepted` + 폴링 링크/상태 리소스 제공. 모두 HTTP 의미론을 따른다. [datatracker.ietf.org](https://datatracker.ietf.org/doc/html/rfc9110?utm_source=chatgpt.com)

### 4) 상태 코드 규칙

- 생성 성공: **201**(+`Location`), 업데이트: **200/204**, 삭제: **204**, 잘못된 요청: **400**, 인증 실패: **401**, 권한 부족: **403**, 없음: **404**, 충돌: **409**, 비정상 서버: **500**. (세부 맵핑은 API별 표로 문서화) [datatracker.ietf.org](https://datatracker.ietf.org/doc/html/rfc9110?utm_source=chatgpt.com)

### 5) 요청/응답 포맷

- 표준 미디어타입: `application/json; charset=utf-8`.
- **콘텐츠 협상**: `Accept`/`Content-Type`를 해석. **필드 선택**은 `fields=prop1,prop2` 쿼리로 제공. (HTTP 의미론과 일반적 가이드 준수) [datatracker.ietf.org+1](https://datatracker.ietf.org/doc/html/rfc9110?utm_source=chatgpt.com)
- **에러 응답은 RFC 7807/9457**: `type,title,detail,status,instance` 필드. 내부 디버그 정보는 **로그에만 기록**, 응답은 사용자 요약 중심. [datatracker.ietf.org+1](https://datatracker.ietf.org/doc/html/rfc7807?utm_source=chatgpt.com)

### 6) 페이징/정렬/필터

- **커서 기반 페이징** 기본: `?limit=50&cursor=...` + 응답 `nextCursor`.
- 정렬: `sort=createdAt:desc`.
- 필터: `?conversationId=...&from=...&to=...`.
- 대량 목록은 **부분 응답**과 TTL 캐시 정책을 문서화. (MS 가이드 참조) [Microsoft GitHub](https://microsoft.github.io/code-with-engineering-playbook/design/design-patterns/rest-api-design-guidance/?utm_source=chatgpt.com)

### 7) 멱등성/재시도

- 클라이언트 재시도 안전을 위해 **멱등성 키**를 도입:
    - **POST 생성·동기화 배치** 등에서 `Idempotency-Key` 헤더를 지원하고 **동일 키+페이로드** 재전송 시 **동일 결과** 보장. 서버는 키와 결과를 일정 시간 보관. (Stripe 권고안 준수) [Stripe Docs+1](https://docs.stripe.com/api/idempotent_requests?utm_source=chatgpt.com)

### 8) 캐싱/조건부 요청

- **읽기 최적화**: 적절한 `Cache-Control`, **ETag/Last-Modified** 노출.
- 조건부 요청 처리: `If-None-Match`/`If-Modified-Since` → **304 Not Modified**. (HTTP 캐싱 표준에 따름) [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Resources_and_specifications?utm_source=chatgpt.com)

### 9) 버전 관리

- 파괴적 변경은 **버전 상승**. **`/v1/...` 경로 버전**을 기본으로 하되, 헤더 버전(예: `Accept: application/vnd.graphnode.v1+json`)은 선택 규칙. (대형 가이드라인의 보편적 선택) [Microsoft GitHub](https://microsoft.github.io/code-with-engineering-playbook/design/design-patterns/rest-api-design-guidance/?utm_source=chatgpt.com)

### 10) 문서화/스키마

- **OpenAPI 3.1**로 스키마 우선 설계.
- 모든 에러 케이스에 **RFC 7807 스키마**를 명시하고, 예제 페이로드 제공. [datatracker.ietf.org](https://datatracker.ietf.org/doc/html/rfc7807?utm_source=chatgpt.com)

---

## 리소스 맵(예시)

- `/conversations` `GET/POST`
- `/conversations/{id}` `GET/PATCH/DELETE`
- `/conversations/{id}/messages` `GET/POST`
- `/messages/{id}` `GET/PATCH/DELETE`
- `/graph/nodes` `GET/POST` , `/graph/nodes/{id}` `GET/PATCH/DELETE`
- `/graph/edges` `GET/POST` , `/graph/edges/{id}` `GET/PATCH/DELETE`
- `/sync/push` `POST` *(멱등성 키 필수)*, `/sync/pull` `GET` *(커서 필수)*

---

## 코드 스케치(Express)

```tsx
// routes/conversations.ts
router.get('/', ctrl.listConversations);      // GET /conversations
router.post('/', ctrl.createConversation);    // POST /conversations (201 + Location)

// controllers/conversations.ts
export async function createConversation(req, res, next) {
  const dto = validateCreate(req.body);
  const { id } = await svc.create(dto, req.user.id);
  res.status(201).location(`/v1/conversations/${id}`).json({ id });
}

```

---

## 자동 강제(품질 게이트)

- **경로 규칙 린트**: URL에 동사 금지(`^/v\\d+/(?!.*(create|update|delete))`).
- **상태코드 매핑 테스트**: CRUD happy/edge 케이스에 대한 통합 테스트.
- **OpenAPI 검증**: CI에서 OpenAPI lint + 샘플 응답 스키마 검증.
- **멱등성 테스트**: 동일 `Idempotency-Key` 재시도 시 **단일 처리**와 동일 응답을 보장하는 테스트. [Stripe Docs](https://docs.stripe.com/api/idempotent_requests?utm_source=chatgpt.com)
- **캐시/조건부 요청 테스트**: ETag 재검증 시 304가 반환되는지 확인. [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Resources_and_specifications?utm_source=chatgpt.com)

---

## 승인 기준(AC)

- **[정적]** 모든 라우트가 **명사형 복수 컬렉션/자원 경로**를 사용(동사형 0건, 린트 통과).
- **[런타임]** `POST` 생성 시 **201 + Location**이 반환되고, `GET`은 부작용이 없다(감사 로그 검증). [datatracker.ietf.org](https://datatracker.ietf.org/doc/html/rfc9110?utm_source=chatgpt.com)
- **[오류]** 에러 응답은 전부 **RFC 7807/9457** 스키마로 직렬화된다(샘플 호출 100% 통과). [datatracker.ietf.org+1](https://datatracker.ietf.org/doc/html/rfc7807?utm_source=chatgpt.com)
- **[신뢰성]** `Idempotency-Key` 재시도 테스트를 통과한다(동일 응답/중복 처리 0건). [Stripe Docs](https://docs.stripe.com/api/idempotent_requests?utm_source=chatgpt.com)
- **[성능]** 커서 기반 페이징이 동작하고, 조건부 요청에서 **304**가 유효하게 반환된다. [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Resources_and_specifications?utm_source=chatgpt.com)