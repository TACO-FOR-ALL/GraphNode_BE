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

    // FIXED(강현일) : Service 단에서 API KEY 검증하게 변경
    // API Key 조회 및 검증
    const { apiKey: userOpenAIApiKey } = await userService.getApiKeys(userId, 'openai');
    if (!userOpenAIApiKey) {
      throw new InvalidApiKeyError('OpenAI API Key is required.');
    }

    // 내부적으로 OpenAI 인스턴스 생성 (Provider 통합 전까지 기존 로직 유지)
    const openai = new OpenAI({ apiKey: userOpenAIApiKey });

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
    try {
      // JSON 파싱 시도, 실패시 기본값 chat으로 설정
      const parsed = JSON.parse(classifierContent) as { mode?: string; reason?: string };
      if (parsed.mode === 'chat' || parsed.mode === 'summary' || parsed.mode === 'note') {
        mode = parsed.mode;
      }
    } catch {
      mode = 'chat';
    }

    // modeHint가 주어졌다면, 그에 따른 모드로 강제 변경
    if (modeHint === 'summary') mode = 'summary';
    if (modeHint === 'note') mode = 'note';

    // 모드 결정 후 Event 전달
    sendEvent('status', { phase: 'analyzing', message: `요청 분석 완료 (mode = ${mode})` });

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
      You are a router inside a note-taking and chat app.
      You must choose EXACTLY ONE of the following modes for the current request:
      - "chat"    : general conversation, Q&A, searching for notes/chats, asking about data, etc.
      - "summary" : the user is asking to summarize, 정리해줘, 요약, 핵심만, 한줄요약, 개요 etc.
      - "note"    : the user is asking to turn content into a note, 회의록, 기록, 노트로 정리, note, meeting minutes, minutes, 기록으로 남겨 etc.
      Rules:
      - If the user explicitly says anything like "노트로 정리해줘", "회의록으로 만들어줘", "note로 만들어줘", "meeting minutes로 만들어줘", "기록으로 남겨줘" → choose "note".
      - If the user explicitly asks for "요약", "정리해줘", "핵심만", "summary", "개요" → choose "summary" (UNLESS they clearly say "노트로 정리" which is "note").
      - If the user asks to find, search, or look up notes/conversations → choose "chat".
      - Greetings or small talk → choose "chat".

      Respond with a JSON object with exactly two keys:
      - mode: one of "chat", "summary", "note"
      - reason: a short explanation of why you chose this mode
      Example: {"mode":"chat","reason":"user wants to search notes"}
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
