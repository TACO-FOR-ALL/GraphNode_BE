import type { ConversationService } from '../../core/services/ConversationService';
import type { NoteService } from '../../core/services/NoteService';
import type { UserFileService } from '../../core/services/UserFileService';
import type { NotionCacheRepository } from '../../core/ports/NotionCacheRepository';
import type { MacroFileType } from '../../core/types/neo4j/macro.neo4j';
import type { UserFileDoc } from '../../core/types/persistence/userFile.persistence';
import { normalizeAiOrigId } from '../../shared/utils/aiNodeId';

/**
 * 그래프 노드가 실제로 어떤 원본(source)에서 왔는지 BE가 판별한 결과 타입입니다.
 *
 * 규칙:
 * - conversation 문서가 존재하면 `chat`
 * - note 문서가 존재하면 `markdown`
 * - user_files 문서가 존재하면 `file`
 * - notion_page_caches 문서가 존재하면 `notion`
 *
 * 동일 origId에 대해 둘 이상이 존재하면 모호하므로 예외를 던집니다.
 */
export type ResolvedGraphSourceType = 'chat' | 'markdown' | 'file' | 'notion';

export interface SourceTypeResolverDeps {
  /** 대화(conversation) 존재 여부 조회 */
  conversationService: ConversationService;
  /** 노트(note) 존재 여부 조회 */
  noteService: NoteService;
  /** 사용자 라이브러리 파일(user_files) 존재 여부 조회 */
  userFileService: UserFileService;
  /** Notion 페이지 캐시 조회. notion origId 판별에 사용됩니다. */
  notionCacheRepo: NotionCacheRepository;
}

/**
 * UserFile 원천 노드를 Neo4j `MacroNode`의 fileType/mimeType으로 매핑할 때 사용하는 힌트입니다.
 */
export interface UserFileResolvedHint {
  mimeType: string;
  macroFileType: MacroFileType;
}

export interface ResolvedSourceTypeResult {
  origId: string;
  normalizedOrigId: string;
  sourceType: ResolvedGraphSourceType | null;
  /** `sourceType === 'file'` 일 때만 채워집니다. */
  userFileHint?: UserFileResolvedHint;
}

export interface BatchResolvedSourceTypeResult {
  sourceTypesByOrigId: Map<string, ResolvedGraphSourceType>;
  /** normalizedOrigId → UserFile 메타(파일 노드 Neo4j 속성 보강용) */
  userFileHintsByOrigId: Map<string, UserFileResolvedHint>;
  unresolvedOrigIds: string[];
}

/**
 * `displayName`·MIME 기준으로 Neo4j MacroFileType을 추론합니다.
 *
 * @param doc 활성 사용자 파일 문서입니다.
 * @returns Macro 저장 모델용 세부 파일 타입입니다.
 */
export function macroFileTypeFromUserFileDoc(doc: UserFileDoc): MacroFileType {
  const lowerName = doc.displayName.toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'pdf';
  if (lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) return 'word';
  if (lowerName.endsWith('.ppt') || lowerName.endsWith('.pptx')) return 'powerpoint';

  const mime = (doc.mimeType || '').toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('word') || mime.includes('document')) return 'word';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'powerpoint';

  return 'other';
}

/**
 * UserFile 문서에서 MIME 및 MacroFileType 힌트를 생성합니다.
 *
 * @param doc 활성 사용자 파일 문서입니다.
 * @returns Neo4j·그래프 노드 메타에 넣을 힌트입니다.
 */
export function buildUserFileResolvedHint(doc: UserFileDoc): UserFileResolvedHint {
  return {
    mimeType: doc.mimeType?.trim() ? doc.mimeType : 'application/octet-stream',
    macroFileType: macroFileTypeFromUserFileDoc(doc),
  };
}

/**
 * @description UserFile 힌트에서 E2E·집계용 `ai_raw_source_type` 라벨을 유도합니다.
 * AI가 노드를 생략해 BE가 보강한 파일 노드에도 동일 규칙을 적용합니다.
 *
 * @param hint UserFile 메타 힌트입니다.
 * @returns `pdf`·`docx`·`pptx` 등 확장자 버킷 키.
 */
export function aiRawSourceTypeFromMacroFileHint(hint: UserFileResolvedHint): string {
  switch (hint.macroFileType) {
    case 'pdf':
      return 'pdf';
    case 'word':
      return 'docx';
    case 'powerpoint':
      return 'pptx';
    case 'spreadsheet':
      return 'xlsx';
    case 'text':
      return 'txt';
    default:
      return 'other';
  }
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
    return {
      origId,
      normalizedOrigId,
      sourceType: 'file',
      userFileHint: buildUserFileResolvedHint(userFileDoc),
    };
  }

  // Fallback: extract ULID candidate directly from raw origId (26 chars alphanumeric)
  const ulidMatch = /[0-9A-Z]{26}/i.exec(origId);
  if (ulidMatch) {
    const extractedUlid = ulidMatch[0].toUpperCase();
    if (extractedUlid !== normalizedOrigId) {
      const fallbackFileDoc = await deps.userFileService.getActiveUserFileById(
        extractedUlid,
        userId
      );
      if (fallbackFileDoc) {
        return {
          origId,
          normalizedOrigId: extractedUlid,
          sourceType: 'file',
          userFileHint: buildUserFileResolvedHint(fallbackFileDoc),
        };
      }
    }
  }

  // Notion 캐시 조회: AI가 `src\d+_<NotionPageUUID>` 형식으로 전달한 origId는
  // normalizeAiOrigId 후 Notion page UUID (하이픈 포함 36자)가 됩니다.
  const notionCacheDoc = await deps.notionCacheRepo.findByPageId(normalizedOrigId, userId);
  if (notionCacheDoc) {
    return { origId, normalizedOrigId, sourceType: 'notion' };
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
    uniqueOrigIds.push(origId);
  }

  const resolvedResults: ResolvedSourceTypeResult[] = [];
  for (const origId of uniqueOrigIds) {
    const resolved = await resolveSourceTypeByOrigId(origId, userId, deps);
    resolvedResults.push(resolved);
  }

  const sourceTypesByOrigId = new Map<string, ResolvedGraphSourceType>();
  const userFileHintsByOrigId = new Map<string, UserFileResolvedHint>();
  const unresolvedOrigIds: string[] = [];

  for (const item of resolvedResults) {
    if (item.sourceType) {
      sourceTypesByOrigId.set(item.normalizedOrigId, item.sourceType);
      if (item.userFileHint) {
        userFileHintsByOrigId.set(item.normalizedOrigId, item.userFileHint);
      }
    } else {
      unresolvedOrigIds.push(item.normalizedOrigId);
    }
  }

  return {
    sourceTypesByOrigId,
    userFileHintsByOrigId,
    unresolvedOrigIds,
  };
}
