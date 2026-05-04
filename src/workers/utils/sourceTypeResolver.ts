import type { ConversationService } from '../../core/services/ConversationService';
import type { NoteService } from '../../core/services/NoteService';
import type { UserFileService } from '../../core/services/UserFileService';
import { normalizeAiOrigId } from '../../shared/utils/aiNodeId';

/**
 * 그래프 노드가 실제로 어떤 원본(source)에서 왔는지 BE가 판별한 결과 타입입니다.
 *
 * 규칙:
 * - conversation 문서가 존재하면 `chat`
 * - note 문서가 존재하면 `markdown`
 * - user_files 문서가 존재하면 `file`
 *
 * 동일 origId에 대해 둘 이상이 존재하면 모호하므로 예외를 던집니다.
 */
export type ResolvedGraphSourceType = 'chat' | 'markdown' | 'file';

export interface SourceTypeResolverDeps {
  /** 대화(conversation) 존재 여부 조회 */
  conversationService: ConversationService;
  /** 노트(note) 존재 여부 조회 */
  noteService: NoteService;
  /** 사용자 라이브러리 파일(user_files) 존재 여부 조회 */
  userFileService: UserFileService;
}

export interface ResolvedSourceTypeResult {
  origId: string;
  normalizedOrigId: string;
  sourceType: ResolvedGraphSourceType | null;
}

export interface BatchResolvedSourceTypeResult {
  sourceTypesByOrigId: Map<string, ResolvedGraphSourceType>;
  unresolvedOrigIds: string[];
}

export async function resolveSourceTypeByOrigId(
  origId: string,
  userId: string,
  deps: SourceTypeResolverDeps
): Promise<ResolvedSourceTypeResult> {
  const normalizedOrigId = normalizeAiOrigId(origId).normalizedOrigId;

  const [conversationDoc, noteDoc, userFileDoc] = await Promise.all([
    deps.conversationService.findDocById(normalizedOrigId, userId),
    deps.noteService.getNoteDoc(normalizedOrigId, userId),
    deps.userFileService.getActiveUserFileById(normalizedOrigId, userId),
  ]);

  const hits = [conversationDoc, noteDoc, userFileDoc].filter(Boolean).length;
  if (hits > 1) {
    throw new Error(
      `Source type resolution is ambiguous for origId=${normalizedOrigId}: multiple sources exist`
    );
  }

  if (conversationDoc) {
    return { origId, normalizedOrigId, sourceType: 'chat' };
  }
  if (noteDoc) {
    return { origId, normalizedOrigId, sourceType: 'markdown' };
  }
  if (userFileDoc) {
    return { origId, normalizedOrigId, sourceType: 'file' };
  }

  return { origId, normalizedOrigId, sourceType: null };
}

export async function resolveSourceTypesByOrigIds(
  origIds: string[],
  userId: string,
  deps: SourceTypeResolverDeps
): Promise<BatchResolvedSourceTypeResult> {
  const uniqueOrigIds: string[] = [];
  const seenOrigIds = new Set<string>();

  for (const origId of origIds) {
    const normalizedOrigId = normalizeAiOrigId(origId).normalizedOrigId;
    if (seenOrigIds.has(normalizedOrigId)) {
      continue;
    }
    seenOrigIds.add(normalizedOrigId);
    uniqueOrigIds.push(normalizedOrigId);
  }

  const resolvedResults: ResolvedSourceTypeResult[] = [];
  for (const origId of uniqueOrigIds) {
    const resolved = await resolveSourceTypeByOrigId(origId, userId, deps);
    resolvedResults.push(resolved);
  }

  const sourceTypesByOrigId = new Map<string, ResolvedGraphSourceType>();
  const unresolvedOrigIds: string[] = [];

  for (const item of resolvedResults) {
    if (item.sourceType) {
      sourceTypesByOrigId.set(item.normalizedOrigId, item.sourceType);
    } else {
      unresolvedOrigIds.push(item.normalizedOrigId);
    }
  }

  return {
    sourceTypesByOrigId,
    unresolvedOrigIds,
  };
}
