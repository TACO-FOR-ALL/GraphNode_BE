import type { NotionBlockTreeNode } from '../../types/persistence/notion_cache.persistence';
import type { NotionBlock, NotionRichText } from '../../../infra/notion/notionApiTypes';

/** @description 1차 릴리스: 텍스트 추출 대상 블록 타입 */
const TEXT_BLOCK_TYPES = new Set([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'quote',
  'callout',
  'toggle',
]);

/**
 * @description Notion Block → 내부 트리 노드 변환 (텍스트 블록만; 이미지/파일 미디어 S3 미러링 없음).
 */
export class NotionBlockParser {
  /**
   * @description 평탄 블록 목록을 parent_id 기준 트리로 조립 (Notion children API 결과용).
   * @param rootBlocks 최상위 블록 배열 (페이지 직속 children).
   * @param childrenByParentId parent block id → child blocks.
   */
  buildTreeFromHierarchy(
    rootBlocks: NotionBlock[],
    childrenByParentId: Map<string, NotionBlock[]>
  ): NotionBlockTreeNode[] {
    return rootBlocks.map((b) => this.toTreeNode(b, 0, childrenByParentId));
  }

  /**
   * @description 단일 블록을 트리 노드로 변환 (재귀 children).
   */
  private toTreeNode(
    block: NotionBlock,
    depth: number,
    childrenByParentId: Map<string, NotionBlock[]>
  ): NotionBlockTreeNode {
    const node: NotionBlockTreeNode = {
      id: block.id,
      type: block.type,
      depth,
      children: [],
    };

    if (TEXT_BLOCK_TYPES.has(block.type)) {
      node.text = this.extractPlainText(block);
    } else {
      // image, file, pdf, embed 등: 텍스트 fallback만 (미디어 S3 미러링 스코프 밖)
      node.text = this.extractPlainTextFallback(block);
    }

    const kids = childrenByParentId.get(block.id) ?? [];
    node.children = kids.map((c) => this.toTreeNode(c, depth + 1, childrenByParentId));

    return node;
  }

  /**
   * @description 트리 전체를 단일 plain text로 직렬화 (GraphGeneration 입력용).
   */
  flattenTreeToPlainText(nodes: NotionBlockTreeNode[]): string {
    const lines: string[] = [];
    const walk = (list: NotionBlockTreeNode[]) => {
      for (const n of list) {
        if (n.text?.trim()) lines.push(n.text.trim());
        if (n.children.length) walk(n.children);
      }
    };
    walk(nodes);
    return lines.join('\n');
  }

  /**
   * @description Notion rich_text 배열에서 plain text 추출.
   */
  extractPlainText(block: NotionBlock): string {
    const payload = block[block.type] as { rich_text?: NotionRichText[] } | undefined;
    if (!payload?.rich_text?.length) return '';
    return payload.rich_text.map((t) => t.plain_text).join('');
  }

  /**
   * @description 미지원 블록 타입 placeholder (확장 전).
   */
  private extractPlainTextFallback(block: NotionBlock): string {
    const text = this.extractPlainText(block);
    if (text) return text;
    return `[${block.type}]`;
  }
}
