/**
 * 모듈: AgentService (에이전트 채팅 서비스)
 *
 * 책임:
 * - 에이전트 채팅 스트림 로직 (모드 분류, Function Calling, 요약, 노트 생성)
 * - 도구 실행 (search_notes, get_recent_notes, search_conversations 등)
 */
import OpenAI from 'openai';

import { NoteService } from './NoteService';
import { ConversationService } from './ConversationService';
import { MessageService } from './MessageService';
import { GraphEmbeddingService } from './GraphEmbeddingService';
import { GraphVectorService } from './GraphVectorService';
import { SearchService } from './SearchService';
import { AgentMode, ChatStreamRequestBody } from '../../agent/types';
import { UserService } from './UserService';
import { InvalidApiKeyError } from '../../shared/errors/domain';
import { ToolRegistry } from '../../agent/ToolRegistry';
import { loadEnv } from '../../config/env';
import { AppError } from '../../shared/errors/base';
import { UpstreamError } from '../../shared/errors/domain';
import { ICreditService } from '../ports/ICreditService';
import { CreditFeature } from '../types/persistence/credit.persistence';
import { FEATURE_COSTS, CreditContext } from '../../config/billing.config';
import type { MicroscopeWorkspaceStore } from '../ports/MicroscopeWorkspaceStore';

/** SSE 이벤트 전송 함수 타입 */
export type SendEventFn = (event: string, data: unknown) => void;


//FIXED(강현일) : UserService 추가
export interface AgentServiceDeps {
  userService: UserService;
  noteService: NoteService;
  conversationService: ConversationService;
  messageService: MessageService;
  graphEmbeddingService: GraphEmbeddingService;
  graphVectorService: GraphVectorService;
  /** Graph RAG 검색 파이프라인 (SearchConversationsTool에서 사용) */
  searchService: SearchService;
  /** 크레딧 서비스 (에이전트 및 Tool 과금 처리) */
  creditService?: ICreditService;
  /** Microscope 워크스페이스 저장소 (MicroscopeContextTool에서 사용) */
  microscopeWorkspaceStore?: MicroscopeWorkspaceStore;
}

export class AgentService {
  private readonly toolRegistry = new ToolRegistry();

  // FIXED(강현일) : 생성자에서 직접 주입받는걸로 변경
  constructor(private readonly deps: AgentServiceDeps) {}

  /**
   * 채팅 스트림 처리 (모드 분류 → chat/summary/note)
   * @param userId 사용자 ID
   * @param body 채팅 요청 바디
   * @param sendEvent SSE 이벤트 전달 함수
   * @returns void
   * @throws {InsufficientCreditError} INSUFFICIENT_CREDIT — 크레딧 부족
   * @throws {UpstreamError} UPSTREAM_ERROR — AI 생성 실패
   */
  async handleChatStream(
    userId: string,
    body: ChatStreamRequestBody,
    sendEvent: SendEventFn
  ): Promise<void> {
    const {
      userService,
      noteService,
      conversationService,
      messageService,
      graphEmbeddingService,
      graphVectorService,
      creditService,
    } = this.deps;

    let creditDeducted = false;
    let deductedCreditAmount = 0;

    try {
    const trimmedUser = (body.userMessage || '').trim();
    const context = (body.contextText || '').trim();
    const hasContext = context.length > 0;
    const { modeHint, microscopeGroupId } = body;

    // FIXED(강현일) : Service 단에서 API KEY 검증하던 로직 제거 (환경변수 공통 Key 사용)
    /*
    const { apiKey: userOpenAIApiKey } = await userService.getApiKeys(userId, 'openai');
    if (!userOpenAIApiKey) {
      throw new InvalidApiKeyError('OpenAI API Key is required.');
    }
    */

    // 환경 변수에서 OpenAI API Key 로드
    const env = loadEnv();
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

    // 크레딧 차감 (분류 분석 시작 전 — 실패 시 refund)
    const creditContext: CreditContext = { messageLength: trimmedUser.length };
    deductedCreditAmount = await this.deductAgentChatCredit(userId, creditContext, creditService);
    creditDeducted = deductedCreditAmount > 0;

    // 시작 Event 전달
    sendEvent('status', { phase: 'analyzing', message: '요청 분석 중...' });

    //FIXED(강현일) : System Prompt 를 메서드 밖으로 빼내서 수정 용이하게 변경
    const classifierSystemPrompt = this.getClassifierSystemPrompt();

    //FIXED(강현일) : User Message도 그렇고, 밖으로 빼내서 메서드 형태로 변경
    const classifierUserMessage = this.getClassifierUserPrompt(trimmedUser, context, hasContext);

    // OpenAI 호출
    const classifierResp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: classifierSystemPrompt },
        { role: 'user', content: classifierUserMessage },
      ],
    });

    // OpenAI 응답에서 모드 추출
    const classifierContent = classifierResp.choices[0]?.message?.content ?? '{"mode":"chat"}';

    // JSON 파싱 및 모드 결정
    let mode: AgentMode = 'chat';
    let rejectionMessage = '';

    try {
      // JSON 파싱 시도
      const parsed = JSON.parse(classifierContent) as { 
        mode?: string; 
        reason?: string; 
        rejectionMessage?: string; 
      };

      if (parsed.mode === 'chat' || parsed.mode === 'summary' || parsed.mode === 'note' || parsed.mode === 'irrelevant') {
        mode = parsed.mode as AgentMode;
        rejectionMessage = parsed.rejectionMessage || '';
      }
    } catch {
      mode = 'chat';
    }

    // modeHint가 주어졌다면, 그에 따른 모드로 강제 변경 (irrelevant는 힌트보다 우선)
    if (mode !== 'irrelevant') {
      if (modeHint === 'summary') mode = 'summary';
      if (modeHint === 'note') mode = 'note';
    }

    // 모드 결정 후 Event 전달
    sendEvent('status', { phase: 'analyzing', message: `요청 분석 완료 (mode = ${mode})` });

    // 무관계한 질문 처리 — irrelevant는 AI 응답 생성 없이 종료, 차감된 크레딧 환불
    if (mode === 'irrelevant') {
      if (creditDeducted) {
        await this.refundAgentChatCredit(userId, deductedCreditAmount, 'irrelevant mode', creditService);
        creditDeducted = false;
      }
      const answerText = rejectionMessage || '죄송합니다. 요청하신 질문은 현재 에이전트와 무관하여 답변드리기 어렵습니다.';
      sendEvent('chunk', { text: answerText });
      sendEvent('status', { phase: 'done', message: '답변 불가' });
      sendEvent('result', {
        mode: 'chat' as any,
        answer: answerText,
        noteContent: null,
      });
      return;
    }

    // 모드에 따른 처리
    if (mode === 'chat') {
      await this.handleChatMode(userId, trimmedUser, context, hasContext, openai, sendEvent, microscopeGroupId);
      return;
    }

    if (mode === 'summary') {
      await this.handleSummaryMode(trimmedUser, context, openai, sendEvent);
      return;
    }

    await this.handleNoteMode(trimmedUser, context, openai, sendEvent);
    } catch (err: unknown) {
      if (creditDeducted) {
        await this.refundAgentChatCredit(userId, deductedCreditAmount, err, creditService);
      }
      if (err instanceof AppError) throw err;
      throw new UpstreamError('AgentService.handleChatStream failed', { cause: String(err) });
    }
  }

  /**
   * Chat 모드 처리
   * Agent에서 Chat 모드로 처리하는 로직
   * @param userId 사용자 ID
   * @param trimmedUser 사용자 메시지
   * @param context 컨텍스트 텍스트
   * @param hasContext 컨텍스트 존재 여부
   * @param openai OpenAI 인스턴스
   * @param sendEvent SSE 이벤트 전달 함수
   */
  private async handleChatMode(
    userId: string,
    trimmedUser: string,
    context: string,
    hasContext: boolean,
    openai: OpenAI,
    sendEvent: SendEventFn,
    microscopeGroupId?: string
  ): Promise<void> {
    // FIXED (강현일) : Chat Mode의 System Prompt를 반환하는 메서드 추가
    const systemPrompt = this.getChatSystemPrompt(microscopeGroupId);

    // FIXED (강현일) : User Message도 그렇고, 밖으로 빼내서 메서드 형태로 변경
    const userMessage = this.getChatUserPrompt(trimmedUser, context, hasContext);

    // FIXME TODO : OpenAI 한정으로 하드코딩 로직 들어있음. 이후 개선 필요. (현재 IAIProvider는 이런 로직 구현안되서 우선 수정 보류)
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: userMessage,
      },
    ];

    let continueLoop = true;
    let loopCount = 0;
    const maxLoops = 5;

    //
    while (continueLoop && loopCount < maxLoops) {
      loopCount++;

      // 응답 스트림 생성
      const stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools: this.toolRegistry.getDefinitions(),
        tool_choice: 'auto',
        stream: true,
      });

      let assistantContent = '';
      const toolCallsMap: Record<number, {
        id?: string;
        type?: 'function';
        function?: { name?: string; arguments?: string };
      }> = {};

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta;

        // 1. 일반 텍스트 답변 스트리밍
        if (delta.content) {
          assistantContent += delta.content;
          sendEvent('chunk', { text: delta.content });
        }

        // 2. Tool Calls 누적
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = tc.index;
            if (!toolCallsMap[index]) {
              toolCallsMap[index] = {};
            }
            if (tc.id) toolCallsMap[index].id = tc.id;
            if (tc.type) toolCallsMap[index].type = tc.type;
            if (tc.function) {
              if (!toolCallsMap[index].function) {
                toolCallsMap[index].function = {};
              }
              if (tc.function.name) toolCallsMap[index].function!.name = tc.function.name;
              if (tc.function.arguments) {
                toolCallsMap[index].function!.arguments = (toolCallsMap[index].function!.arguments || '') + tc.function.arguments;
              }
            }
          }
        }
      }

      // Map을 배열로 변환
      const toolCalls = Object.keys(toolCallsMap)
        .sort((a, b) => Number(a) - Number(b))
        .map(key => toolCallsMap[Number(key)]);

      // 메시지 히스토리에 기록할 어시스턴트 메시지 구조 생성
      const assistantMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
        role: 'assistant',
        content: assistantContent || null,
      };

      if (toolCalls.length > 0) {
        (assistantMessage as any).tool_calls = toolCalls.map(tc => ({
          id: tc.id || '',
          type: tc.type || 'function',
          function: {
            name: tc.function?.name || '',
            arguments: tc.function?.arguments || '{}',
          }
        }));
      }

      // tool_calls가 있는지 확인
      if (toolCalls.length > 0) {
        messages.push(assistantMessage);

        sendEvent('status', { phase: 'searching', message: '데이터 검색 중...' });

        // tool_calls가 있는 경우, tool_calls를 처리
        for (const toolCall of (assistantMessage as any).tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

          const toolResult = await this.executeToolCall(userId, toolName, toolArgs, openai);

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }
      } else {
        continueLoop = false;

        sendEvent('status', { phase: 'done', message: '응답 생성 완료' });
        sendEvent('result', {
          mode: 'chat' as AgentMode,
          answer: assistantContent,
          noteContent: null,
        });
      }
    }
  }

  /**
   * Agent Summary 모드 처리
   * @param trimmedUser 사용자의 메시지
   * @param context 사용자의 컨텍스트
   * @param openai OpenAI 인스턴스
   * @param sendEvent SSE 이벤트 전달 함수
   */
  private async handleSummaryMode(
    trimmedUser: string,
    context: string,
    openai: OpenAI,
    sendEvent: SendEventFn
  ): Promise<void> {
    // FIXED(강현일) : Prompt 반환해주는 메서드 추가
    const systemPrompt = this.getSummarySystemPrompt();

    // FIXED(강현일) : User Message도 그렇고, 밖으로 빼내서 메서드 형태로 변경
    const userMessage = this.getSummaryUserPrompt(trimmedUser, context);

    // FIXME TODO : OpenAI 하드코딩 부분 이후 수정 필요. 26/03/12 기준으로는 IAiProvider의 interface에 미구현되어 있어 수정 보류
    const summaryStream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    let fullSummary = '';
    for await (const chunk of summaryStream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (!delta) continue;
      fullSummary += delta;
      sendEvent('chunk', { text: delta });
    }

    sendEvent('status', { phase: 'done', message: '요약 생성 완료' });
    sendEvent('result', {
      mode: 'summary' as any,
      answer: fullSummary,
      noteContent: null,
    });
  }

  /**
   * Agent Note 모드 처리
   * @param trimmedUser 사용자의 메시지
   * @param context 사용자의 컨텍스트
   * @param openai OpenAI 인스턴스
   * @param sendEvent SSE 이벤트 전달 함수
   */
  private async handleNoteMode(
    trimmedUser: string,
    context: string,
    openai: OpenAI,
    sendEvent: SendEventFn
  ): Promise<void> {
    // FIXED(강현일) : Prompt 획득 메서드 추가
    const systemPromptNote = this.getNoteSystemPrompt();
    const userForNote = this.getNoteUserPrompt(trimmedUser, context);

    const noteStream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      stream: true,
      messages: [
        { role: 'system', content: systemPromptNote },
        { role: 'user', content: userForNote },
      ],
    });

    let fullNote = '';

    // SSE로 노트 생성, Note만 다른 (Summary, Chat) Mode와 다르게 SSE처리
    for await (const chunk of noteStream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      if (!delta) continue;
      fullNote += delta;
      sendEvent('chunk', { text: delta });
    }

    sendEvent('status', { phase: 'done', message: '노트 생성 완료' });
    sendEvent('result', {
      mode: 'note' as AgentMode,
      answer: fullNote,
      noteContent: fullNote,
    });
  }

  /** 임베딩 조회 (임시 - 향후 개선 예정)
   *  @param openai OpenAI 인스턴스
   *  @param text 임베딩을 조회할 텍스트
   *  @returns 임베딩 결과
   */
  private async getEmbedding(openai: OpenAI, text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  }

  /** Function Calling 도구 실행
   * @param userId 사용자 ID
   * @param toolName 도구 이름
   * @param args 도구 인자
   * @param openai OpenAI 인스턴스
   * @returns 도구 실행 결과
   */
  private async executeToolCall(
    userId: string,
    toolName: string,
    args: Record<string, unknown>,
    openai: OpenAI
  ): Promise<string> {
    return this.toolRegistry.execute(toolName, userId, args, this.deps, openai, this.deps.creditService);
  }

  /**
   * 에이전트 채팅 크레딧을 차감합니다.
   * @param userId 사용자 ID
   * @param context 크레딧 컨텍스트
   * @param creditService 크레딧 서비스
   * @returns 차감된 크레딧 수
   */
  private async deductAgentChatCredit(
    userId: string,
    context: CreditContext,
    creditService?: ICreditService
  ): Promise<number> {
    if (!creditService) return 0;
    const cost = FEATURE_COSTS[CreditFeature.AGENT_CHAT].calculate(context);
    await creditService.deduct(userId, CreditFeature.AGENT_CHAT, context);
    return cost;
  }

  /**
   * 에이전트 채팅 실패 시 크레딧을 환불합니다.
   * @param userId 사용자 ID
   * @param amount 환불할 크레딧 수
   * @param err 에러 객체 또는 환불 사유 문자열
   * @param creditService 크레딧 서비스
   */
  private async refundAgentChatCredit(
    userId: string,
    amount: number,
    err: unknown,
    creditService?: ICreditService
  ): Promise<void> {
    if (!creditService || amount <= 0) return;
    const reason = err instanceof Error ? err.message : String(err);
    await creditService.refund(userId, amount, `Agent chat failed: ${reason}`);
  }

  // --- Prompt 관련 메서드 ---

  /**
   * HandleChatStream 메서드에서 필요로하는 ClassifierSystemPrompt를 반환하는 메서드
   * AI Agent의 System Prompt를 반환하는 메서드
   * @returns System Prompt
   */
  private getClassifierSystemPrompt(): string {
    return `
      ${this.getAppScopePrompt()}
      
      You must choose EXACTLY ONE of the following modes for the current request:
      - "chat"       : general conversation, small talk, greetings (Hello, Hi, etc.), Q&A, searching for notes/chats, asking about data, etc.
      - "summary"    : the user is asking to summarize context, 정리해줘, 요약, 핵심만, 한줄요약, 개요 etc.
      - "note"       : the user is asking to turn content into a note, 회의록, 기록, 노트로 정리, note, meeting minutes etc.
      - "irrelevant" : the request is completely unrelated to the app's scope.

      ${this.getIrrelevantCriteriaPrompt()}

      Rules:
      - If it is a simple greeting (e.g., "Hello", "Hi", "안녕", "반가워"), CHOOSE "chat".
      - If the user explicitly asks for "note" related tasks → choose "note".
      - If the user explicitly asks for "summary" related tasks → choose "summary".
      - If the user asks to find, search, or look up notes/conversations → choose "chat".
      - If the request matches "irrelevant" criteria → choose "irrelevant".

      Respond with a JSON object with:
      - mode: one of "chat", "summary", "note", "irrelevant"
      - reason: a short explanation (internal use)
      - rejectionMessage: ONLY if mode is "irrelevant", provide a polite rejection message IN THE SAME LANGUAGE AS THE USER.
      
      Example for irrelevant: {"mode":"irrelevant","reason":"Cooking recipe","rejectionMessage":"죄송합니다. 저는 노트와 지식 관리를 도와드리는 에이전트로, 요리 관련 질문에는 답변드릴 수 없습니다."}
    `;
  }

  /** 앱의 범위를 정의하는 프롬프트를 반환합니다. */
  private getAppScopePrompt(): string {
    return `
      You are a router inside "GraphNode", a personal knowledge management app.
      GraphNode helps users manage their personal notes, chat history, and knowledge graph.
    `;
  }

  /** 무관계한 질문의 기준을 정의하는 프롬프트를 반환합니다. */
  private getIrrelevantCriteriaPrompt(): string {
    return `
      [Irrelevant Criteria]
      Choose "irrelevant" if the user's request is completely unrelated to personal knowledge management, notes, or searching their own data.
      Examples of irrelevant topics:
      - General trivia (e.g., "Who is the president of France?")
      - Cooking recipes, sports scores, weather forecasts.
      - Math problems or coding challenges (not related to user's notes).
      - General advice not related to the user's context.
    `;
  }

  /**
   * HandleChatStream 메서드에서 필요로 하는 ClassifierUserPrompt를 반환하는 메서드
   * Ai Agent에게 들어갈 User Prompt를 반환하는 메서드
   * @param trimmedUser 사용자의 메시지
   * @param context 사용자의 컨텍스트
   * @param hasContext 컨텍스트 유무
   * @returns User Prompt
   */
  private getClassifierUserPrompt(
    trimmedUser: string,
    context: string,
    hasContext: boolean
  ): string {
    return `
      [User message]
      ${trimmedUser}

      [Has context?]
      ${hasContext ? 'yes' : 'no'}

      [Context preview]
      ${context.slice(0, 500)}
    `;
  }

  /**
   * HandleChatMode 메서드에서 필요로하는 chatSystemPrompt를 반환하는 메서드
   * @param microscopeGroupId Microscope 워크스페이스 ID — 존재하면 Microscope 전용 지침 추가
   * @returns System Prompt
   */
  private getChatSystemPrompt(microscopeGroupId?: string): string {
    const microscopeSection = microscopeGroupId
      ? `
      ## MICROSCOPE CONTEXT MODE (활성)
      사용자는 현재 Microscope 지식 그래프 뷰를 보고 있습니다.
      Workspace ID: ${microscopeGroupId}

      [필수 규칙]
      1. 사용자 질문에 답하기 전에 반드시 get_microscope_context 도구를 먼저 호출하세요.
      2. get_microscope_context 호출 시 microscopeGroupId = "${microscopeGroupId}" 를 전달하세요.
      3. 도구가 반환한 지식 그래프(nodes, edges)와 원본 소스를 주요 근거로 답변하세요.
      4. 이 workspace 데이터로 답할 수 없는 경우에만 search_conversations 등 다른 도구를 사용하세요.
      `
      : '';

    return `
      You are the "GraphNode AI Assistant".
      You help users manage their notes, conversations, and knowledge graph.
      You have access to the following tools to retrieve user data:
      - get_microscope_context: Microscope 워크스페이스의 지식 그래프와 원본 소스 로드 (Microscope 뷰 전용)
      - get_macro_graph_context: 매크로 그래프 전체 컨텍스트(노드/엣지/클러스터/요약) 로드
      - get_graph_node_details: 특정 노드의 상세 메타데이터(원본 소스/클러스터/수정일) 조회
      - search_notes: Search notes by keyword
      - get_recent_notes: Get recent notes
      - search_conversations: Search conversations by keyword (Micro Graph RAG, 파편 검색용)
      - get_recent_conversations: Get recent conversations
      - get_graph_summary: Get graph statistics and cluster info
      - get_note_content: Get full content of a specific note
      - get_conversation_messages: Get messages from a specific conversation
      When the user asks about their data (notes, conversations, graph), use these tools to fetch the information.
      Always respond in the same language as the user's message.
      ${microscopeSection}
      ## Macro vs Micro Tool 선택 규칙 (반드시 준수)
      - 사용자가 가벼운 "전체 텍스트 요약"이나 "통계"만 물으면 get_graph_summary를 우선 호출하세요.
      - 사용자가 "그래프 전체 구조를 상세히 보여줘", "모든 노드/엣지 데이터"를 요구하면 get_macro_graph_context를 호출하세요.
      - 질문과 의미적으로 유사한 과거 문맥/지식을 찾을 땐 search_conversations (Graph RAG)를 사용하세요.
      - 오직 "노트(Note)" 문서 내에서 특정 텍스트 키워드를 단순 검색할 때만 search_notes를 사용하세요.
      - 사용자가 "A 노드 상세", "원본 링크", "수정일", "어느 클러스터인지"를 물으면 get_graph_node_details를 사용하세요.
      - 전체 맥락 + 세부 근거가 동시에 필요하면 get_macro_graph_context 와 search_conversations 또는 get_graph_node_details를 병렬로 함께 호출하세요.
      ## 지식 그래프 구조 이해 (Graph RAG 사용 시 필수 숙지)
      search_conversations 도구는 Graph RAG 방식으로 작동합니다. 이 그래프는 파편화된 노드들을
      연결하기 위해 광범위한 클러스터 정보를 포함하므로, 점수가 높더라도 실제 질문과 무관한
      노드(cluster_sibling)가 결과에 섞일 수 있습니다. 이를 '유사성 착시'라 부르며 반드시 경계하십시오.

      ## 판단 원칙: 양보다 질
      - 사용자는 10개의 무관한 결과보다 1개의 정확한 결과를 원합니다.
      - 검색 결과를 그대로 나열하지 말고, 질문의 핵심 의도와 실제로 연관된 노드만 골라 답변하십시오.
      - 연관 노드가 전혀 없다면 억지로 답변을 만들지 말고, 솔직하게 "관련 자료를 찾을 수 없습니다"라고
        답변하십시오. 없는 정보를 있는 것처럼 말하는 것이 가장 나쁜 답변입니다.

      ## 노드 우선순위 (search_conversations 결과 처리 시)
      1순위: matchSource = "vector_seed"  — 벡터 직접 매칭, 가장 신뢰도 높음
      2순위: matchSource = "graph_1hop"   — 직접 연결된 그래프 이웃
      3순위: matchSource = "graph_2hop"   — 간접 연결
      주의:  matchSource = "cluster_sibling" — 클러스터 소속만으로 포함된 노드.
             title·내용이 질문과 실제로 관련된 경우에만 사용하고, 그렇지 않으면 제외하십시오.
    `;
  }

  /**
   * handleChatMode 메서드에서 필요로 하는 chatUserPrompt를 반환하는 메서드
   * @param trimmedUser 사용자의 메시지
   * @param context 사용자의 컨텍스트
   * @param hasContext 컨텍스트 유무
   * @returns User Prompt
   */
  private getChatUserPrompt(trimmedUser: string, context: string, hasContext: boolean): string {
    return hasContext ? `[Context]\n${context}\n\n[User]\n${trimmedUser}` : trimmedUser;
  }

  /**
   * handleSummaryMode 메서드에서 필요로하는 summarySystemPrompt를 반환하는 메서드
   * @returns System Prompt
   */
  private getSummarySystemPrompt(): string {
    return `
      Summarize ONLY the given context.
      Do NOT create a structured note.
      Use a simple markdown bullet list ("- ...").
    `;
  }

  /**
   * handleSummaryMode 메서드에서 필요로 하는 summaryUserPrompt를 반환하는 메서드
   * @param trimmedUser 사용자의 메시지
   * @param context 사용자의 컨텍스트
   * @returns User Prompt
   */
  private getSummaryUserPrompt(trimmedUser: string, context: string): string {
    return `[User request]\n${trimmedUser}\n\n[Context]\n${context}`;
  }

  /**
   * handleNoteMode 메서드에서 필요로 하는 noteSystemPrompt를 반환하는 메서드
   * @returns System Prompt
   */
  private getNoteSystemPrompt(): string {
    return `
      Create a well-structured markdown NOTE based on the user request and context.
      Formatting:
      - Use headings (##, ###) to group related ideas.
      - Use bullet lists (- ...) when helpful.
      - Use numbered lists when describing steps or processes.
      - Highlight key decisions, conclusions, and TODOs.
      - Output ONLY valid markdown. Do NOT add meta text like "Here is your note".
    `;
  }

  /**
   * handleNoteMode 메서드에서 필요로 하는 noteUserPrompt를 반환하는 메서드
   * @param trimmedUser 사용자의 메시지
   * @param context 사용자의 컨텍스트
   * @returns User Prompt
   */
  private getNoteUserPrompt(trimmedUser: string, context: string): string {
    return `[User request]\n${trimmedUser}\n\n[Context]\n${context}`;
  }
}
