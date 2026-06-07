import { NotionBlockParser } from '../../src/core/services/notion/NotionBlockParser';
import type { NotionBlock } from '../../src/infra/notion/notionApiTypes';

describe('NotionBlockParser', () => {
  const parser = new NotionBlockParser();

  it('extracts plain text from paragraph rich_text', () => {
    const block: NotionBlock = {
      id: 'b1',
      type: 'paragraph',
      has_children: false,
      paragraph: { rich_text: [{ plain_text: 'Hello Notion' }] },
    };
    expect(parser.extractPlainText(block)).toBe('Hello Notion');
  });

  it('builds parent-child tree and flattens to plain text', () => {
    const parent: NotionBlock = {
      id: 'p1',
      type: 'heading_1',
      has_children: true,
      heading_1: { rich_text: [{ plain_text: 'Title' }] },
    };
    const child: NotionBlock = {
      id: 'c1',
      type: 'paragraph',
      has_children: false,
      paragraph: { rich_text: [{ plain_text: 'Body' }] },
    };
    const map = new Map<string, NotionBlock[]>([['p1', [child]]]);
    const tree = parser.buildTreeFromHierarchy([parent], map);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(parser.flattenTreeToPlainText(tree)).toContain('Title');
    expect(parser.flattenTreeToPlainText(tree)).toContain('Body');
  });
});
