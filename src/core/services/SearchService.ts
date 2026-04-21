import { logger } from '../../shared/utils/logger';
import type { NoteSearchResult, ConversationSearchResult, SearchResult } from '../../shared/dtos/search';
import { ConversationRepository } from '../ports/ConversationRepository';
import { NoteRepository } from '../ports/NoteRepository';
import { MessageRepository } from '../ports/MessageRepository';
import type { ConversationDoc, MessageDoc } from '../types/persistence/ai.persistence';
import type { NoteDoc } from '../types/persistence/note.persistence';

/**
 * 모듈: SearchService (통합 검색 서비스)
 * 책임: 노트 및 AI 대화 전반에 걸친 통합 키워드 검색을 수행합니다.
 *
 * @remarks
 * MongoDB `$regex`를 사용한 case-insensitive 부분 일치 검색입니다.
 * Atlas Search 등 전용 검색 엔진 없이 즉시 동작하며, 대규모 데이터에서는
 * full-scan이 발생하므로 데이터가 늘어나면 인덱스 전략 재검토가 필요합니다.
 *
 * 반환 정렬 기준: notes / chatThreads 모두 updatedAt 내림차순 (최신 수정순).
 * 반환 형식: 전문 대신 키워드 주변 snippet만 포함 (NoteSearchResult, ConversationSearchResult).
 */
export class SearchService {
  /**
   * @param convRepo 대화 저장소 인터페이스 (Port)
   * @param noteRepo 노트 저장소 인터페이스 (Port)
   * @param msgRepo 메시지 저장소 인터페이스 (Port)
   */
  constructor(
    private readonly convRepo: ConversationRepository,
    private readonly noteRepo: NoteRepository,
    private readonly msgRepo: MessageRepository
  ) {}

  /**
   * 노트(제목·내용)와 AI 대화(제목·메시지 내용)를 통합 키워드 검색합니다.
   *
   * @description
   * ## 처리 흐름
   *
   * ### Phase 1 — 병렬 검색 (3방향 동시 실행)
   * ```
   * convRepo.searchByKeyword   → 대화 제목에서 키워드 매칭
   * noteRepo.searchNotesByKeyword → 노트 제목·내용에서 키워드 매칭
   * msgRepo.searchByKeyword    → 메시지 내용에서 키워드 매칭
   * ```
   *
   * ### Phase 2 — 대화 결과 조립 (중복 없이 합산)
   * 메시지 매칭 결과에서 conversation ID를 추출하되,
   * 이미 제목 매칭으로 잡힌 conversation은 다시 조회하지 않습니다.
   * (같은 대화가 제목+메시지 양쪽에서 매칭되어도 결과에 1번만 나와야 하기 때문)
   *
   * ### Phase 3 — 각 대화의 snippet 결정
   * - 제목 매칭 대화: 마지막 메시지의 첫 문장 (가장 최근 문맥 제공)
   * - 메시지 매칭 대화: 키워드가 포함된 문장 주변 (~150자)
   *
   * ### Phase 4 — 노트 snippet 결정
   * content에서 키워드 위치를 찾아 전후 문맥을 추출합니다.
   *
   * @param userId 검색을 수행하는 사용자의 고유 ID
   * @param keyword 검색할 키워드 (공백만 있으면 빈 결과 반환)
   * @returns 검색된 notes와 chatThreads (updatedAt 내림차순 정렬)
   */
  async integratedSearchByKeyword(userId: string, keyword: string): Promise<SearchResult> {
    if (!keyword.trim()) {
      return { notes: [], chatThreads: [] };
    }

    logger.info({ userId, keyword }, '[SearchService] 통합 키워드 검색 시작');

    // ── Phase 1: 3방향 병렬 검색 ──────────────────────────────────────────────
    //
    // 세 가지 검색을 동시에 실행하여 IO 대기 시간을 최소화합니다.
    // - titleMatchedConvDocs : conversations 컬렉션에서 title 필드에 keyword가 매칭된 대화 목록
    // - matchedNoteDocs      : notes 컬렉션에서 title 또는 content에 keyword가 매칭된 노트 목록
    // - matchedMsgDocs       : messages 컬렉션에서 content에 keyword가 매칭된 메시지 목록
    //
    // 예) keyword = "딥러닝" 일 때:
    //   titleMatchedConvDocs = [{ _id: 'c1', title: '딥러닝 스터디', updatedAt: 2000, ... }]
    //   matchedNoteDocs      = [{ _id: 'n1', title: '딥러닝 노트', content: '...딥러닝...', ... }]
    //   matchedMsgDocs       = [
    //     { _id: 'm1', conversationId: 'c2', content: '딥러닝 모델이란 무엇인가?', ... },
    //     { _id: 'm2', conversationId: 'c1', content: '딥러닝 관련 논문 추천', ... },
    //   ]
    const [titleMatchedConvDocs, matchedNoteDocs, matchedMsgDocs] = await Promise.all([
      this.convRepo.searchByKeyword(userId, keyword),
      this.noteRepo.searchNotesByKeyword(userId, keyword),
      this.msgRepo.searchByKeyword(userId, keyword),
    ]);

    // ── Phase 2-a: 메시지 매칭 결과를 conversation 단위로 그룹화 ──────────────
    //
    // 목적 1) 어떤 conversationId에서 메시지 매칭이 발생했는지 파악 (keys() 활용)
    // 목적 2) 해당 대화의 snippet 생성 시 실제 매칭된 메시지 문장을 꺼내기 위해 (get(id)?.[0])
    //
    // 예) 위 matchedMsgDocs 기준:
    //   msgMatchesByConvId = Map {
    //     'c2' => [{ _id: 'm1', content: '딥러닝 모델이란 무엇인가?', ... }],
    //     'c1' => [{ _id: 'm2', content: '딥러닝 관련 논문 추천', ... }],
    //   }
    //
    // → c1은 제목 매칭에도 이미 존재 / c2는 메시지 매칭에만 존재
    const msgMatchesByConvId = new Map<string, MessageDoc[]>();
    for (const msg of matchedMsgDocs) {
      const list = msgMatchesByConvId.get(msg.conversationId) ?? [];
      list.push(msg);
      msgMatchesByConvId.set(msg.conversationId, list);
    }

    // ── Phase 2-b: 제목 매칭 conversation ID를 Set으로 캐싱 ───────────────────
    //
    // 이미 제목 검색에서 잡힌 대화 ID를 기억해두기 위한 Set입니다.
    // 다음 단계에서 "메시지 매칭에는 있지만 제목 매칭에는 없는" ID만 골라내는 데 사용합니다.
    //
    // 예) titleMatchedConvDocs = [{ _id: 'c1', ... }]
    //   titleMatchedConvIdSet = Set { 'c1' }
    const titleMatchedConvIdSet = new Set(titleMatchedConvDocs.map((c) => c._id));

    // ── Phase 2-c: 메시지 매칭에만 존재하는 extra 대화 조회 ──────────────────
    //
    // msgMatchesByConvId의 키(= 메시지 매칭 conversation IDs)에서
    // titleMatchedConvIdSet에 이미 있는 것들을 제거하면,
    // "메시지에서는 매칭됐지만 제목에서는 매칭 안 된" 순수 extra conversation IDs가 남습니다.
    //
    // 예) msgMatchesByConvId.keys() = ['c2', 'c1']
    //     titleMatchedConvIdSet     = Set { 'c1' }
    //   extraConvIds = ['c2']  ← c1은 이미 제목 매칭에 있으므로 제외
    //
    // 이후 findByIds로 c2의 ConversationDoc을 가져옵니다.
    // filter(deletedAt === null)로 소프트 삭제된 대화는 제외합니다.
    const extraConvIds = [...msgMatchesByConvId.keys()].filter(
      (id) => !titleMatchedConvIdSet.has(id)
    );
    const extraConvDocs =
      extraConvIds.length > 0
        ? (await this.convRepo.findByIds(extraConvIds, userId)).filter((c) => c.deletedAt === null)
        : [];

    // ── Phase 3-a: 제목 매칭 대화의 마지막 메시지 조회 (snippet용) ────────────
    //
    // 제목 매칭 대화의 snippet은 "마지막 메시지의 첫 문장"으로 결정합니다.
    //
    // findLastMessagesByConversationIds는 MongoDB $group + $first 집계를 사용하여
    // DB 레벨에서 대화당 최신 1개만 반환합니다.
    // → 전체 메시지를 올려서 애플리케이션에서 Map 덮어쓰기로 최신을 찾는 방식 대비
    //   IO가 대폭 절감됩니다.
    //
    // 예) c1에 메시지 1000개가 있어도 DB가 최신 1개만 반환 → 1개 문서만 전송됨
    const titleMatchedIds = titleMatchedConvDocs.map((c) => c._id);
    const lastMessagesForTitleMatches =
      titleMatchedIds.length > 0
        ? await this.msgRepo.findLastMessagesByConversationIds(titleMatchedIds)
        : [];

    // ── Phase 3-b: conversationId → 마지막 메시지 Map 구축 ────────────────────
    //
    // findLastMessagesByConversationIds가 이미 대화당 최신 1개만 반환하므로,
    // 단순히 conversationId → MessageDoc으로 매핑합니다.
    //
    // 예) lastMessagesForTitleMatches = [m_new(c1, t=300), m_last(c3, t=500)]
    //   → lastMsgByConvId = Map { 'c1' => m_new, 'c3' => m_last }
    const lastMsgByConvId = new Map<string, MessageDoc>();
    for (const msg of lastMessagesForTitleMatches) {
      lastMsgByConvId.set(msg.conversationId, msg);
    }

    // ── Phase 3-c: 제목 매칭 대화 결과 생성 ─────────────────────────────────
    //
    // snippet = 마지막 메시지의 첫 문장 (메시지가 없으면 빈 문자열)
    // 예) c1의 마지막 메시지 content = "딥러닝 관련 논문 추천. 특히 Transformer 계열을 추천드립니다."
    //   → snippet = "딥러닝 관련 논문 추천."
    const titleMatchedResults: ConversationSearchResult[] = titleMatchedConvDocs.map((conv) =>
      buildConvResult(conv, getFirstSentence(lastMsgByConvId.get(conv._id)?.content ?? ''))
    );

    // ── Phase 3-d: 메시지 매칭 대화 결과 생성 ────────────────────────────────
    //
    // snippet = 해당 대화에서 첫 번째로 매칭된 메시지의 키워드 주변 문맥
    // msgMatchesByConvId.get(conv._id)?.[0] → 그 대화의 첫 번째 매칭 메시지
    //
    // 예) c2의 첫 매칭 메시지 content = "딥러닝 모델이란 무엇인가? 개념부터 설명드리겠습니다."
    //     keyword = "딥러닝"
    //   → snippet = "딥러닝 모델이란 무엇인가? 개념부터 설명..."
    const msgMatchedResults: ConversationSearchResult[] = extraConvDocs.map((conv) => {
      const firstMatchedMsg = msgMatchesByConvId.get(conv._id)?.[0];
      return buildConvResult(
        conv,
        firstMatchedMsg ? extractSnippet(firstMatchedMsg.content, keyword) : ''
      );
    });

    // 제목 매칭 + 메시지 매칭 결과를 합쳐 updatedAt 내림차순 정렬
    const chatThreads = [...titleMatchedResults, ...msgMatchedResults].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    // ── Phase 4: 노트 결과 생성 ───────────────────────────────────────────────
    //
    // content에서 keyword 위치를 찾아 전후 문맥 (~150자)을 snippet으로 사용합니다.
    // keyword가 title에만 있고 content에는 없으면 content 앞부분을 반환합니다.
    // updatedAt 내림차순 정렬 후 DTO로 변환합니다.
    const notes: NoteSearchResult[] = matchedNoteDocs
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((doc) => buildNoteResult(doc, keyword));

    logger.info(
      { userId, keyword, noteCount: notes.length, threadCount: chatThreads.length },
      '[SearchService] 통합 키워드 검색 완료'
    );

    return { notes, chatThreads };
  }
}

// ── 내부 유틸 함수 ────────────────────────────────────────────────────────────

/**
 * 텍스트에서 keyword 주변 문맥을 추출합니다.
 *
 * @description
 * keyword 위치를 기준으로 앞 50자 + keyword + 뒤 100자를 잘라 반환합니다.
 * 잘린 앞/뒤에는 `...`을 붙여 더 많은 내용이 있음을 나타냅니다.
 * keyword가 text에 없으면 text 앞부분 maxLength자를 반환합니다 (title match 시 preview 용도).
 *
 * @example
 * extractSnippet("오늘 딥러닝 공부를 했습니다. 매우 어렵습니다.", "딥러닝")
 * // → "오늘 딥러닝 공부를 했습니다. 매우 어렵습니다."  (짧으면 전체)
 *
 * @param text 검색 대상 원문
 * @param keyword 검색 키워드
 * @param maxLength keyword가 없을 때 반환할 최대 길이
 * @returns keyword 주변 문맥 문자열
 */
function extractSnippet(text: string, keyword: string, maxLength = 150): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  const kwLower = keyword.toLowerCase();
  const idx = lower.indexOf(kwLower);
  if (idx === -1) {
    // keyword가 이 text에 없는 경우 (= title 매칭이었거나 매칭 위치 불명확): 앞부분 preview 반환
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }
  const start = Math.max(0, idx - 50);
  const end = Math.min(text.length, idx + keyword.length + 100);
  return (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
}

/**
 * 텍스트의 첫 문장을 반환합니다.
 *
 * @description
 * `.` `!` `?` `\n` 중 첫 번째로 나오는 위치까지 잘라 반환합니다.
 * 문장 구분자가 없으면 전체 text를 사용합니다.
 * 결과가 maxLength를 초과하면 잘라서 `...`을 붙입니다.
 *
 * @example
 * getFirstSentence("안녕하세요. 반갑습니다. 잘 부탁드립니다.")
 * // → "안녕하세요."
 *
 * @param text 원문 (빈 문자열이면 빈 문자열 반환)
 * @param maxLength 반환할 최대 길이
 * @returns 첫 문장 문자열
 */
function getFirstSentence(text: string, maxLength = 150): string {
  if (!text) return '';
  const match = text.match(/^[^.!?\n]+[.!?\n]?/);
  const sentence = (match ? match[0] : text).trim();
  return sentence.length > maxLength ? sentence.substring(0, maxLength) + '...' : sentence;
}

/**
 * ConversationDoc과 snippet 문자열로 ConversationSearchResult DTO를 생성합니다.
 *
 * @param conv DB에서 조회한 대화 문서
 * @param snippet 이 대화에 표시할 미리보기 문자열
 * @returns ConversationSearchResult DTO
 */
function buildConvResult(conv: ConversationDoc, snippet: string): ConversationSearchResult {
  return {
    id: conv._id,
    title: conv.title,
    snippet,
    createdAt: new Date(conv.createdAt).toISOString(),
    updatedAt: new Date(conv.updatedAt).toISOString(),
  };
}

/**
 * NoteDoc과 keyword로 NoteSearchResult DTO를 생성합니다.
 *
 * @description
 * content에서 keyword 주변 문맥을 추출해 snippet으로 사용합니다.
 * keyword가 content에 없으면 (= title에만 매칭된 경우) content 앞부분을 반환합니다.
 *
 * @param doc DB에서 조회한 노트 문서
 * @param keyword 검색 키워드 (snippet 추출에 사용)
 * @returns NoteSearchResult DTO
 */
function buildNoteResult(doc: NoteDoc, keyword: string): NoteSearchResult {
  return {
    id: doc._id,
    title: doc.title,
    snippet: extractSnippet(doc.content, keyword),
    folderId: doc.folderId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
