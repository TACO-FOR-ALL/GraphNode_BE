# Notion Auth & Proxy API Reference (`client.notionAuth`)

The Notion SDK surface wraps the existing backend OAuth and Notion proxy routes.
The backend performs Notion retry/backoff internally. If Notion API retries are
exhausted, the SDK receives a `502 UpstreamError` problem response. Exhausted
Notion retries use the backend upstream-error contract.

## Summary

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `getAuthUrl()` | `GET /api/auth/notion` | Return a Notion authorization URL | 200, 302, 401 |
| `getRootPages()` | `GET /api/notion/pages` | List root pages for the linked Notion workspace | 200, 400, 401, 502 |
| `getBlockChildren(blockId, cursor?)` | `GET /api/notion/blocks/:blockId/children` | Page through direct child blocks | 200, 400, 401, 502 |
| `getPageById(pageId)` | `GET /notion-api/pages/:pageId` | Fetch cached metadata for a specific Notion page | 200, 400, 401, 404, 502 |

## Error Contract

| Status | Error class | `code` | Notes |
| :--- | :--- | :--- | :--- |
| `400 Bad Request` | `ValidationError` | `VALIDATION_FAILED` | Invalid request or integration state |
| `401 Unauthorized` | `AuthError` | `AUTH_REQUIRED` | Login required |
| `502 Bad Gateway` | `UpstreamError` | `UPSTREAM_ERROR` | Notion API retry exhaustion or upstream Notion failure |

## Methods

### `getAuthUrl(redirect?)`

Returns the Notion authorization URL for linking a workspace.

```typescript
const response = await client.notionAuth.getAuthUrl();
if (response.isSuccess) {
  window.open(response.data.url, 'NotionAuth', 'width=600,height=800');
}
```

Response type:

```typescript
interface AuthUrlResponse {
  url: string;
}
```

Status codes:

- `200 OK`: URL returned
- `302 Found`: Redirect response when `redirect=true`
- `401 Unauthorized`: Login required

### `getRootPages()`

Lists root pages from the linked Notion workspace.

```typescript
const response = await client.notionAuth.getRootPages();
if (response.isSuccess) {
  console.log(response.data.results);
}
```

Response type:

```typescript
interface NotionRichTextDTO {
  type: string;
  plain_text: string;
  href: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
  text?: {
    content: string;
    link: { url: string } | null;
  };
}

interface NotionPageParentDTO {
  type: string;
  [key: string]: unknown;
}

interface NotionPageDTO {
  id: string;
  object: string;
  type: string;
  parent: NotionPageParentDTO;
  has_children: boolean;
  archived: boolean;
  created_time: string;
  last_edited_time: string;
  title: NotionRichTextDTO[];
}

interface NotionPagesResponseDTO {
  results: NotionPageDTO[];
}
```

Status codes:

- `200 OK`: Pages returned
- `400 Bad Request`: Invalid Notion integration state or request
- `401 Unauthorized`: Login required
- `502 UpstreamError`: Notion API retry exhaustion or upstream Notion failure

### `getBlockChildren(blockId, cursor?)`

Lists direct child blocks for a Notion page or block using cursor pagination.

```typescript
const page1 = await client.notionAuth.getBlockChildren('block-uuid');
if (page1.isSuccess && page1.data.has_more && page1.data.next_cursor) {
  const page2 = await client.notionAuth.getBlockChildren(
    'block-uuid',
    page1.data.next_cursor,
  );
  console.log(page2.data.results);
}
```

Response type:

```typescript
interface NotionBlockDTO {
  id: string;
  object: string;
  type: string;
  has_children: boolean;
  archived?: boolean;
  created_time?: string;
  last_edited_time?: string;
  [key: string]: unknown;
}

interface NotionBlocksResponseDTO {
  results: NotionBlockDTO[];
  next_cursor: string | null;
  has_more: boolean;
}
```

Status codes:

- `200 OK`: Blocks returned
- `400 Bad Request`: Missing or invalid block ID
- `401 Unauthorized`: Login required
- `502 UpstreamError`: Notion API retry exhaustion or upstream Notion failure

### `getPageById(pageId)`

Fetches cached metadata for a specific Notion page (useful when clicking a Notion-sourced node in the graph).

```typescript
const response = await client.notionAuth.getPageById('page-uuid-1234');
if (response.isSuccess) {
  console.log(response.data.title);
}
```

Status codes:

- `200 OK`: Page data returned
- `400 Bad Request`: Missing page ID
- `401 Unauthorized`: Login required
- `404 Not Found`: Page not in cache or no access
- `502 UpstreamError`: Notion API server error
