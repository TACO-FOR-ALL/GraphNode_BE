import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('SDK Notion getRootPages contract', () => {
  const endpointSource = readFileSync(
    join(process.cwd(), 'z_npm_sdk/src/endpoints/auth.notion.ts'),
    'utf8',
  );
  const typeSource = readFileSync(join(process.cwd(), 'z_npm_sdk/src/types/notion.ts'), 'utf8');
  const markdownSource = readFileSync(
    join(process.cwd(), 'z_npm_sdk/docs/endpoints/auth.notion.md'),
    'utf8',
  );

  it('returns the typed Notion pages response without any[]', () => {
    const getRootPagesMethod =
      /async getRootPages\(\): Promise<HttpResponse<NotionPagesResponseDTO>> \{[\s\S]*?\n  \}/.exec(
        endpointSource,
      )?.[0];

    expect(getRootPagesMethod).toBeDefined();
    expect(getRootPagesMethod).toContain('.get<NotionPagesResponseDTO>()');
    expect(getRootPagesMethod).not.toContain('any[]');
  });

  it('exports the required NotionPageDTO fields', () => {
    const requiredFields = [
      'id: string',
      'object: string',
      'type: string',
      'parent: NotionPageParentDTO',
      'has_children: boolean',
      'archived: boolean',
      'created_time: string',
      'last_edited_time: string',
      'title: NotionRichTextDTO[]',
    ];

    expect(typeSource).toContain('export interface NotionPageDTO');
    for (const field of requiredFields) {
      expect(typeSource).toContain(field);
    }
    expect(typeSource).toContain('results: NotionPageDTO[]');
  });

  it('returns the typed Notion blocks response without any[]', () => {
    const getBlockChildrenMethod =
      /async getBlockChildren\([\s\S]*?\): Promise<HttpResponse<NotionBlocksResponseDTO>> \{[\s\S]*?\n  \}/.exec(
        endpointSource,
      )?.[0];

    expect(getBlockChildrenMethod).toBeDefined();
    expect(getBlockChildrenMethod).toContain('.get<NotionBlocksResponseDTO>()');
    expect(getBlockChildrenMethod).not.toContain('any[]');
    expect(typeSource).toContain('export interface NotionBlockDTO');
    expect(typeSource).toContain('export interface NotionBlocksResponseDTO');
    expect(typeSource).toContain('results: NotionBlockDTO[]');
  });

  it('documents exhausted Notion retries as 502 UpstreamError, not 429 RateLimitError', () => {
    for (const source of [endpointSource, markdownSource]) {
      expect(source).toContain('502 UpstreamError');
      expect(source).toContain('Notion API retry exhaustion');
      expect(source).not.toContain('429 Too Many Requests');
      expect(source).not.toContain('RateLimitError');
    }
  });
});
