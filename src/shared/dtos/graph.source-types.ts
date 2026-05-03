/**
 * Graph API에서 외부 계약으로 노출하는 sourceType 값 목록입니다.
 *
 * Neo4j 내부 저장 모델은 `MacroNodeType`(`conversation`, `note`, `notion`, `file`)을 사용하지만,
 * 기존 FE/API 계약은 `chat`, `markdown`, `notion` 문자열을 유지합니다. 이 파일은 API/DTO/
 * validation 계층에서 같은 문자열 union을 반복 선언하지 않도록 하는 단일 관리 지점입니다.
 */
export const GRAPH_SOURCE_TYPES = ['chat', 'markdown', 'notion'] as const;

/**
 * FE와 서버 API가 주고받는 graph node sourceType입니다.
 *
 * @remarks
 * - `chat`: 기존 대화 기반 노드입니다.
 * - `markdown`: 노트/마크다운 기반 노드입니다.
 * - `notion`: Notion 기반 노드입니다.
 */
export type GraphSourceType = (typeof GRAPH_SOURCE_TYPES)[number];
