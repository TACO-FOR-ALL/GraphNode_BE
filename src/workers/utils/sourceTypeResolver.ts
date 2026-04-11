import type { ConversationService } from '../../core/services/ConversationService';
import type { NoteService } from '../../core/services/NoteService';
import { normalizeAiOrigId } from '../../shared/utils/aiNodeId';

/**
 * 그래프 노드가 실제로 어떤 원본(source)에서 왔는지 BE가 판별한 결과 타입입니다.
 *
 * 규칙:
 * - conversation 문서가 존재하면 `chat`
 * - note 문서가 존재하면 `markdown`
 *
 * 현재 범위에서는 AI 서버가 주는 `source_type`을 신뢰하지 않고,
 * 실제 MongoDB 기준 truth source를 사용합니다.
 */
export type ResolvedGraphSourceType = 'chat' | 'markdown';

/**
 * sourceType 판별에 필요한 서비스 의존성 묶음입니다.
 *
 * 왜 필요한가:
 * - 이 유틸은 단순 문자열 가공이 아니라 실제 DB 존재 여부를 확인해야 합니다.
 * - conversation, note를 각각 조회하는 서비스가 모두 필요하므로,
 *   handler가 해당 서비스를 유틸로 전달하는 방식으로 의존성을 명시합니다.
 *
 * @property conversationService conversation origId 존재 여부를 확인하는 서비스
 * @property noteService note origId 존재 여부를 확인하는 서비스
 */
export interface SourceTypeResolverDeps {
  conversationService: ConversationService;
  noteService: NoteService;
}

/**
 * origId 하나에 대한 sourceType 판별 결과입니다.
 *
 * @property origId 호출자가 넘긴 원본 입력 ID
 *   - 예: `src0_conv-e2e-123`
 *   - 예: `note-e2e-123`
 * @property normalizedOrigId `normalizeAiOrigId()`를 거쳐 정규화된 ID
 *   - 예: `conv-e2e-123`
 *   - 예: `note-e2e-123`
 * @property sourceType 실제 DB 기준 판별 결과
 *   - conversation 존재 시 `chat`
 *   - note 존재 시 `markdown`
 *   - 둘 다 없으면 `null`
 */
export interface ResolvedSourceTypeResult {
  origId: string;
  normalizedOrigId: string;
  sourceType: ResolvedGraphSourceType | null;
}

/**
 * 여러 origId를 한 번에 판별한 결과입니다.
 *
 * @property sourceTypesByOrigId normalized origId -> sourceType 맵
 *   - 예: `conv-e2e-123 -> chat`
 *   - 예: `note-e2e-123 -> markdown`
 * @property unresolvedOrigIds conversation/note 어느 쪽에서도 찾지 못한 normalized origId 목록
 *   - handler는 이 값을 보고 실패 처리 또는 경고 로그를 남길 수 있습니다.
 */
export interface BatchResolvedSourceTypeResult {
  sourceTypesByOrigId: Map<string, ResolvedGraphSourceType>;
  unresolvedOrigIds: string[];
}

/**
 * origId 하나를 실제 DB 기준으로 조회하여 sourceType을 판별합니다.
 *
 * 배경:
 * - 2026-04-11 기준 조사에서, AI 서버가 내려주는 `source_type` 값은 누락되거나
 *   저장 경로에서 신뢰하기 어려운 사례가 보고되었습니다.
 * - 우리는 AI 코드를 수정할 수 없으므로, BE에서 `origId` 기준으로 실제 source를 재판별해야 합니다.
 * - 이 함수는 conversation과 note를 모두 조회하여, 저장 직전의 최종 truth sourceType을 계산합니다.
 *
 * 내부 흐름:
 * 1. `normalizeAiOrigId()`로 `src<number>_` prefix를 제거합니다.
 * 2. conversationService로 해당 ID의 conversation 존재 여부를 확인합니다.
 * 3. noteService로 해당 ID의 note 존재 여부를 확인합니다.
 * 4. conversation만 있으면 `chat`, note만 있으면 `markdown`을 반환합니다.
 * 5. 둘 다 있으면 데이터 충돌 상태이므로 예외를 던집니다.
 * 6. 둘 다 없으면 `null`을 반환합니다.
 *
 * @param origId AI payload 또는 상위 로직이 넘긴 원본 ID
 * @param userId 현재 사용자 ID
 * @param deps sourceType 판별에 필요한 서비스 의존성 묶음
 * @returns raw/normalized origId와 최종 sourceType을 함께 담은 결과 객체
 */
export async function resolveSourceTypeByOrigId(
  origId: string,
  userId: string,
  deps: SourceTypeResolverDeps
): Promise<ResolvedSourceTypeResult> {
  const normalizedOrigId = normalizeAiOrigId(origId).normalizedOrigId;

  const [conversationDoc, noteDoc] = await Promise.all([
    deps.conversationService.findDocById(normalizedOrigId, userId),
    deps.noteService.getNoteDoc(normalizedOrigId, userId),
  ]);

  if (conversationDoc && noteDoc) {
    throw new Error(
      `Source type resolution is ambiguous for origId=${normalizedOrigId}: conversation and note both exist`
    );
  }

  if (conversationDoc) {
    return {
      origId,
      normalizedOrigId,
      sourceType: 'chat',
    };
  }

  if (noteDoc) {
    return {
      origId,
      normalizedOrigId,
      sourceType: 'markdown',
    };
  }

  return {
    origId,
    normalizedOrigId,
    sourceType: null,
  };
}

/**
 * origId 목록을 실제 DB 기준으로 일괄 판별하여 sourceType 맵을 생성합니다.
 *
 * 왜 배치 함수가 필요한가:
 * - handler는 노드 수가 많을 수 있으므로, 판별 결과를 모아서 처리하는 흐름이 더 읽기 쉽습니다.
 * - 또한 입력 중복을 제거한 뒤 조회하면 로그와 오류 보고가 더 명확해집니다.
 *
 * 내부 흐름:
 * 1. 입력 origId 목록을 모두 정규화합니다.
 * 2. 중복된 normalized origId를 제거합니다.
 * 3. 각 normalized origId에 대해 `resolveSourceTypeByOrigId()`를 호출합니다.
 * 4. 판별 성공 건은 `sourceTypesByOrigId` 맵에 넣습니다.
 * 5. 판별 실패 건은 `unresolvedOrigIds` 배열에 모읍니다.
 *
 * 예시 반환:
 * ```ts
 * {
 *   sourceTypesByOrigId: new Map([
 *     ['conv-e2e-123', 'chat'],
 *     ['note-e2e-123', 'markdown'],
 *   ]),
 *   unresolvedOrigIds: []
 * }
 * ```
 *
 * @param origIds sourceType을 판별할 origId 목록
 * @param userId 현재 사용자 ID
 * @param deps sourceType 판별에 필요한 서비스 의존성 묶음
 * @returns normalized origId 기준 sourceType 맵과 미해결 ID 목록
 */
export async function resolveSourceTypesByOrigIds(
  origIds: string[],
  userId: string,
  deps: SourceTypeResolverDeps
): Promise<BatchResolvedSourceTypeResult> {
  const uniqueOrigIds: string[] = [];
  const seenOrigIds = new Set<string>();

  // origId 중복 제거
  for (const origId of origIds) {
    const normalizedOrigId = normalizeAiOrigId(origId).normalizedOrigId;
    if (seenOrigIds.has(normalizedOrigId)) {
      continue;
    }
    seenOrigIds.add(normalizedOrigId);
    uniqueOrigIds.push(normalizedOrigId);
  }

  // 각 origId에 대해 sourceType 판별
  const resolvedResults: ResolvedSourceTypeResult[] = [];
  for (const origId of uniqueOrigIds) {
    const resolved = await resolveSourceTypeByOrigId(origId, userId, deps);
    resolvedResults.push(resolved);
  }

  // sourceType 맵 생성
  const sourceTypesByOrigId = new Map<string, ResolvedGraphSourceType>();
  const unresolvedOrigIds: string[] = [];

  // sourceType 맵 생성
  for (const item of resolvedResults) {
    if (item.sourceType) {
      sourceTypesByOrigId.set(item.normalizedOrigId, item.sourceType);
    } else {
      unresolvedOrigIds.push(item.normalizedOrigId);
    }
  }

  // 결과 반환
  return {
    sourceTypesByOrigId,
    unresolvedOrigIds,
  };
}
