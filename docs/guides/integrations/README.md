# 외부 연동 (Integrations) 문서 인덱스

| 연동 | FE 가이드 | BE·운영 | OpenAPI |
|------|-----------|---------|---------|
| **Notion OAuth + Webhook** | **[notion-fe-handoff.md](./notion-fe-handoff.md)** · [notion-fe-integration.md](./notion-fe-integration.md) | [notion-integration.md](./notion-integration.md) | `/api/auth/notion`, `/api/webhooks/notion` |
| Google 로그인 | — | [AUTH_JWT.md](../../architecture/AUTH_JWT.md) §2 | `/auth/google/*` |
| Apple 로그인 | — | [AUTH_JWT.md](../../architecture/AUTH_JWT.md) §3 | `/auth/apple/*` |

## Notion — SDK 정리

| 레이어 | 사용 여부 | 설명 |
|--------|-----------|------|
| **GraphNode BE** | REST 직접 호출 (`undici`) | `@notionhq/client` npm 패키지는 **사용하지 않음**. `NotionApiClient`가 공식 REST API를 호출합니다. |
| **GraphNode FE** | **Notion SDK 불필요** | BE OAuth·웹훅·캐시만 사용. Notion API 키를 FE에 두지 않습니다. |
| **Notion 공식** | 참고용 | [Authorization](https://developers.notion.com/docs/authorization), [Retrieve block children](https://developers.notion.com/reference/get-block-children), [Webhooks](https://developers.notion.com/reference/webhooks) |

신입·FE는 **먼저 [notion-fe-handoff.md](./notion-fe-handoff.md)** (목차·링크·env·웹훅) → 필요 시 [notion-fe-integration.md](./notion-fe-integration.md) (코드 스니펫) 순으로 읽으면 됩니다.
