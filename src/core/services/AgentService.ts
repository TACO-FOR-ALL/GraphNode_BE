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
import { AgentMode, ChatStreamRequestBody } from '../../agent/types';
import { UserService } from './UserService';
import { InvalidApiKeyError } from '../../shared/errors/domain';
import { ToolRegistry } from '../../agent/ToolRegistry';
import { loadEnv } from '../../config/env';

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
    } = this.deps;

    const trimmedUser = (body.userMessage || '').trim();
    const context = (body.contextText || '').trim();
    const hasContext = context.length > 0;
    const { modeHint } = body;

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

    // 무관계한 질문 처리
    if (mode === 'irrelevant') {
      sendEvent('chunk', { text: rejectionMessage || '죄송합니다. 요청하신 질문은 현재 에이전트와 무관하여 답변드리기 어렵습니다.' });
      sendEvent('status', { phase: 'done', message: '답변 불가' });
      return;
    }

    // 모드에 따른 처리
    if (mode === 'chat') {
      await this.handleChatMode(userId, trimmedUser, context, hasContext, openai, sendEvent);
      return;
    }

    if (mode === 'summary') {
      await this.handleSummaryMode(trimmedUser, context, openai, sendEvent);
      return;
    }

    await this.handleNoteMode(trimmedUser, context, openai, sendEvent);
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
    sendEvent: SendEventFn
  ): Promise<void> {
    // FIXED (강현일) : Chat Mode의 System Prompt를 반환하는 메서드 추가
    const systemPrompt = this.getChatSystemPrompt();

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

      // 응답 생성
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools: this.toolRegistry.getDefinitions(),
        tool_choice: 'auto',
      });

      // 응답 선택
      const choice = response.choices[0];
      const assistantMessage = choice.message;

      // tool_calls가 있는지 확인
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        messages.push(assistantMessage);

        sendEvent('status', { phase: 'searching', message: '데이터 검색 중...' });

        // tool_calls가 있는 경우, tool_calls를 처리
        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.type !== 'function') continue;

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

        const finalContent = assistantMessage.content || '';

        sendEvent('chunk', { text: finalContent });
        sendEvent('status', { phase: 'done', message: '응답 생성 완료' });
        sendEvent('result', {
          mode: 'chat' as AgentMode,
          answer: finalContent,
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
    const summaryResp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    const summary = summaryResp.choices[0]?.message?.content ?? '';

    sendEvent('chunk', { text: summary });
    sendEvent('status', { phase: 'done', message: '요약 생성 완료' });
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
    return this.toolRegistry.execute(toolName, userId, args, this.deps, openai);
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
   * @returns System Prompt
   */
  private getChatSystemPrompt(): string {
    return `
      You are the "GraphNode AI Assistant".
      You help users manage their notes, conversations, and knowledge graph.
      You have access to the following tools to retrieve user data:
      - search_notes: Search notes by keyword
      - get_recent_notes: Get recent notes
      - search_conversations: Search conversations by keyword
      - get_recent_conversations: Get recent conversations
      - get_graph_summary: Get graph statistics and cluster info
      - get_note_content: Get full content of a specific note
      - get_conversation_messages: Get messages from a specific conversation
      When the user asks about their data (notes, conversations, graph), use these tools to fetch the information.
      Always respond in the same language as the user's message.
      Keep responses concise and helpful.
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
