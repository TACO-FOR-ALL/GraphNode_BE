/**
 * Graph API가 외부 계약으로 노출하는 sourceType 값 목록입니다.
 *
 * 서버 내부 Neo4j 모델은 `conversation`, `note`, `notion`, `file`을 사용하지만,
 * SDK/FE 계약은 기존 문자열인 `chat`, `markdown`, `notion`을 유지합니다.
 */
export const GRAPH_SOURCE_TYPES = ['chat', 'markdown', 'notion', 'file'] as const;

/** FE SDK에서 사용하는 graph node sourceType입니다. */
export type GraphSourceType = (typeof GRAPH_SOURCE_TYPES)[number];
