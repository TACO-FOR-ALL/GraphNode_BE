# Notion OAuth 2.0 · Webhook · 로컬 캐시

## 문서 (FE / BE)

| 대상 | 문서 |
|------|------|
| **프론트** | [notion-fe-handoff.md](../integrations/notion-fe-handoff.md) · [notion-fe-integration.md](../integrations/notion-fe-integration.md) |
| **백엔드·운영** | [notion-integration.md](../integrations/notion-integration.md) |
| **인덱스** | [integrations/README.md](../integrations/README.md) |

## 요약

- **PostgreSQL** `notion_integrations`: 사용자 1:N Notion 워크스페이스 OAuth 토큰
- **MongoDB** `notion_page_caches`: 페이지 블록 트리·`updatedAt` (웹훅·GraphGeneration 증분용)
- **API**: `GET /api/auth/notion`, `GET /api/auth/notion/callback`, `POST /api/webhooks/notion`
- **Graph bundle**: `graph-generation/{taskId}/notions.json` (캐시된 Notion 페이지 → `source_type: notion`)

## 환경 변수

| 변수 | 용도 |
|------|------|
| `OAUTH_NOTION_CLIENT_ID` | Public Integration Client ID |
| `OAUTH_NOTION_CLIENT_SECRET` | Client Secret |
| `OAUTH_NOTION_REDIRECT_URI` | OAuth callback (예: `https://api.example.com/api/auth/notion/callback`) |
| `NOTION_WEBHOOK_VERIFICATION_TOKEN` | Webhook HMAC 서명 키 (대시보드 구독 시 1회 수신) |

세 값이 없으면 Notion 라우트는 마운트되지 않습니다.

## 운영 체크리스트

1. [Notion My Integrations](https://www.notion.so/my-integrations)에서 Public Integration 생성
2. Redirect URI에 `OAUTH_NOTION_REDIRECT_URI` 등록
3. Webhooks 탭에서 `POST /api/webhooks/notion` 구독 (`page.content_updated` 등)
4. 최초 POST의 `verification_token`을 `NOTION_WEBHOOK_VERIFICATION_TOKEN`에 저장
5. `npx prisma migrate deploy` (마이그레이션 `20260524120000_notion_integration`)

## 텍스트 블록 / 범위

`NotionBlockParser`는 paragraph·heading·list 등 **텍스트 블록만** 본문으로 추출합니다. 이미지·파일·embed 등 Notion 미디어의 **S3 미러링은 하지 않습니다** (스코프 밖).
