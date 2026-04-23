/**
 * 모듈: AiInteractionService (AI 채팅 서비스)
 *
 * 책임:
 * - AI 모델(OpenAI, Gemini, Claude 등)과의 대화 로직을 조율합니다.
 * - Stateful Sliding Window + Batched Summary 방식으로 토큰을 방어합니다.
 *   직접 컨텍스트 윈도우(MAX_DIRECT_WINDOW=20)와 배치 요약(SUMMARY_BATCH_TURNS=5턴)을
 *   조합하여 API 호출 비용을 최소화합니다.
 * - Vercel AI SDK 기반 Tool Calling(ReAct 루프, maxSteps=5)을 지원합니다.
 * - ChatManagementService를 통해 대화 내용과 메시지를 관리합니다.
 * - AI API 키는 환경변수(서비스 자체 키)에서 조회합니다.
 *
 * 컨텍스트 전략:
 *   [MEMORY(누적 요약)] + [Pending expelled(미요약 expelled)] + [Direct Window(최근 20개)] + [현재 메시지]
 *   요약 갱신: expelled 턴이 SUMMARY_BATCH_TURNS(5)의 배수일 때만 실행 → DB 쓰기 최소화.
 *
 * 외부 의존:
 * - Vercel AI SDK: streamText / generateText (각 Provider 구현체 내부)
 * - loadEnv: 서비스 자체 API 키 조회
 */

import 'multer';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

import { AppError } from '../../shared/errors/base';
import {
  InsufficientCreditError,
  NotFoundError,
  ProviderRateLimitError,
  UpstreamError,
  ValidationError,
} from '../../shared/errors/domain';
import { AIchatType } from '../../shared/ai-providers/AIchatType';
import { ChatManagementService } from './ChatManagementService';
import { UserService } from './UserService';
import { AIChatResponseDto, ChatMessage, ChatThread, Attachment } from '../../shared/dtos/ai';
import { AiResponse, getAiProvider, IAiProvider } from '../../shared/ai-providers/index';
import { ApiKeyModel } from '../../shared/dtos/me';
import { StoragePort } from '../ports/StoragePort';
import { withRetry } from '../../shared/utils/retry';
import { loadEnv } from '../../config/env';
import { captureEvent, POSTHOG_EVENT } from '../../shared/utils/posthog';
import { ToolExecutionContext } from '../../shared/ai-providers/toolContext';
import { STORAGE_BUCKETS, buildStorageKey } from '../../config/storageConfig';

/** 항상 그대로 전송하는 최신 메시지 수 (Direct Window). */
const MAX_DIRECT_WINDOW = 20;

/**
 * 요약 갱신을 트리거하는 최소 expelled 턴 수.
 * expelled 턴이 이 값의 배수가 될 때만 요약 API를 호출합니다.
 * (5턴 = user+assistant 쌍 5개 ≈ 10개 메시지)
 */
const SUMMARY_BATCH_TURNS = 5;

export class AiInteractionService {
  constructor(
    private readonly chatManagementService: ChatManagementService,
    private readonly userService: UserService,
    private readonly storageAdapter: StoragePort
  ) {}

  /**
   * 모델에 해당하는 서비스 자체 API 키를 환경변수에서 반환합니다.
   *
   * @description env.ts가 시작 시점에 키 존재를 검증하므로 런타임에는 항상 유효한 키가 반환됩니다.
   * @param model AI 모델 식별자
   * @returns 서비스 자체 API 키 문자열
   * @throws {ValidationError} VALIDATION_FAILED — 지원하지 않는 모델
   */
  private getSystemApiKey(model: ApiKeyModel): string {
    const env = loadEnv();
    switch (model) {
      case 'openai':
      case 'deepseek':
        return env.OPENAI_API_KEY;
      case 'gemini':
        return env.GEMINI_API_KEY;
      case 'claude':
        return env.CLAUDE_API_KEY;
      default:
        throw new ValidationError(`Unsupported AI model: ${model}`);
    }
  }

  /**
   * Tool 실행 컨텍스트를 생성합니다.
   * DALL-E 이미지 생성은 항상 OpenAI API 키를 사용합니다.
   */
  private buildToolCtx(): ToolExecutionContext {
    const env = loadEnv();
    return {
      storageAdapter: this.storageAdapter,
      openaiApiKey: env.OPENAI_API_KEY,
      tavilyApiKey: env.TAVILY_API_KEY,
    };
  }

  /**
   * 서비스 자체 API 키 유효성 확인
   *
   * @param ownerUserId 요청자 사용자 ID
   * @param model 확인할 AI 모델
   * @returns true (시스템 키가 구성된 경우)
   * @throws {ValidationError} VALIDATION_FAILED — 지원하지 않는 모델
   */
  async checkApiKey(ownerUserId: string, model: ApiKeyModel): Promise<boolean> {
    this.getSystemApiKey(model);
    return true;
  }

  /**
   * 윈도우 밖으로 밀려난 메시지 배치와 기존 요약을 합쳐 고밀도 누적 메모리를 AI로 생성합니다.
   *
   * @description
   *   영문 시스템 프롬프트로 AI 추론 성능을 극대화하고, 결과물 언어는 원본 대화 언어를 따릅니다.
   *   고정 길이 제한 없이 정보 밀도에 따라 AI가 적정 길이를 자율 결정합니다.
   * @param newBatchMessages 이번 배치에 새로 expelled된 메시지 목록 (system 메시지 제외)
   * @param existingSummary DB에 저장된 기존 누적 메모리 (없으면 undefined)
   * @param provider 요약 생성에 사용할 AI Provider
   * @param apiKey AI API 키
   * @param modelName 구체적인 모델명 (선택)
   * @returns 갱신된 고밀도 누적 메모리 문자열, 실패 시 undefined
   */
  private async generateSummary(
    newBatchMessages: ChatMessage[],
    existingSummary: string | undefined,
    provider: IAiProvider,
    apiKey: string,
    modelName?: string
  ): Promise<string | undefined> {
    const newBatchText = newBatchMessages
      .filter((m) => m.role !== 'system')
      .map((m) => `[${m.role}]: ${m.content}`)
      .join('\n');

    const systemPrompt = `You are a conversation memory compressor. Your output will be injected as context for a future AI assistant call — treat it as a knowledge record, not a human-readable summary.

      Compression rules (apply in priority order):
      1. USER DECISIONS & PREFERENCES — preserve verbatim or near-verbatim (e.g., "User decided to use PostgreSQL", "User prefers concise answers").
      2. PERSONAL / DOMAIN IDENTIFIERS — names, product names, version numbers, proper nouns, technical keywords must never be dropped.
      3. ACTION ITEMS & CONCLUSIONS — capture any agreed next steps or final answers.
      4. BACKGROUND & EXPLANATION — compress aggressively; omit if inferable from the above.

      Encoding style: structured key-value or bullet notation; no prose filler; no meta-commentary about the conversation itself.

      Output language: match the dominant language of the conversation content (e.g., Korean if the conversation is primarily in Korean).

      Output length: proportional to information density. Complex multi-topic discussions may warrant longer records; simple Q&A warrants short ones. Never pad.`;

    const userPrompt = existingSummary
      ? `=== EXISTING MEMORY (retain and update) ===\n${existingSummary}\n\n=== NEW CONVERSATION BATCH (merge into memory) ===\n${newBatchText}\n\nProduce an updated high-density memory record that incorporates both.`
      : `=== CONVERSATION BATCH TO COMPRESS ===\n${newBatchText}\n\nProduce a high-density memory record.`;

    // tools 미전달 — 요약 생성은 순수 텍스트 생성만 필요
    const result = await provider.generateChat(apiKey, {
      model: modelName,
      messages: [
        { id: 'sum-sys', role: 'system', content: systemPrompt },
        { id: 'sum-req', role: 'user', content: userPrompt },
      ],
    });

    return result.ok ? result.data.content : undefined;
  }

  /**
   * 메시지 배열에서 user 역할 메시지 수(= 대화 턴 수)를 반환합니다.
   *
   * @param messages 대상 메시지 배열
   * @returns user 메시지 개수
   */
  private countUserTurns(messages: ChatMessage[]): number {
    return messages.filter((m) => m.role === 'user').length;
  }

  /**
   * 메시지 배열의 앞에서 첫 N개의 user 턴이 끝나는 exclusive 인덱스를 반환합니다.
   *
   * @description
   *   user 메시지를 기준으로 N번째 턴의 마지막 메시지(assistant 응답 포함) 다음 인덱스를 반환합니다.
   *   N이 실제 턴 수보다 크면 messages.length를 반환합니다.
   * @param messages 대상 메시지 배열
   * @param turns 세고자 하는 user 턴 수
   * @returns 첫 turns개 user 턴을 포함하는 exclusive end 인덱스
   */
  private indexAfterNUserTurns(messages: ChatMessage[], turns: number): number {
    if (turns <= 0) return 0;
    let count = 0;
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role === 'user') {
        count++;
        if (count === turns) {
          // 이 user 메시지 이후의 assistant 응답까지 포함
          let end = i + 1;
          while (end < messages.length && messages[end].role !== 'user') end++;
          return end;
        }
      }
    }
    return messages.length;
  }

  /**
   * 히스토리에 Batched Sliding Window + 누적 요약을 적용하여 최종 AI 전송용 메시지 배열을 반환합니다.
   *
   * @description
   * 컨텍스트 구성: [MEMORY system msg] + [Pending expelled] + [Direct Window] + [currentMessage]
   *
   * 요약 갱신 조건 (배치형):
   *   - expelled 턴 수가 SUMMARY_BATCH_TURNS(5)의 배수가 될 때만 generateSummary 호출.
   *   - 매 호출마다 요약하지 않으므로 API 비용·레이턴시를 대폭 절감.
   *
   * Pending expelled 처리:
   *   - 아직 요약에 포함되지 않은 expelled 메시지는 Direct Window 앞에 그대로 첨부.
   *   - 맥락 손실 없이 정확한 컨텍스트를 유지합니다.
   *
   * @param historyMessages DB에서 로드한 대화 히스토리 (오름차순)
   * @param currentMessage 현재 사용자 메시지
   * @param conversationId 대화방 ID (summary DB 업데이트용)
   * @param ownerUserId 소유자 ID
   * @param existingSummary 현재 DB에 저장된 누적 메모리 (없으면 undefined)
   * @param provider 요약 생성에 사용할 AI Provider
   * @param apiKey AI API 키
   * @param modelName 구체적인 모델명 (선택)
   * @returns 최종 AI 전송용 메시지 배열
   */
  private async buildContextMessages(
    historyMessages: ChatMessage[],
    currentMessage: ChatMessage,
    conversationId: string,
    ownerUserId: string,
    existingSummary: string | undefined,
    provider: IAiProvider,
    apiKey: string,
    modelName?: string
  ): Promise<ChatMessage[]> {
    let summary = existingSummary;

    const buildResult = (msgs: ChatMessage[]): ChatMessage[] => {
      const ctx: ChatMessage[] = [];
      if (summary)
        ctx.push({
          id: 'ctx-memory',
          role: 'system',
          content: `[CONVERSATION MEMORY]\n${summary}`,
        });
      return [...ctx, ...msgs, currentMessage];
    };

    if (historyMessages.length <= MAX_DIRECT_WINDOW) {
      return buildResult(historyMessages);
    }

    // Direct Window: 최신 MAX_DIRECT_WINDOW개 메시지
    const windowMessages: ChatMessage[] = historyMessages.slice(-MAX_DIRECT_WINDOW);
    const allExpelled: ChatMessage[] = historyMessages.slice(0, -MAX_DIRECT_WINDOW);

    // expelled 대화 턴 수 계산 (user 메시지 기준)
    const expelledTurns: number = this.countUserTurns(allExpelled);

    // 배치 경계 도달 시에만 요약 갱신 — DB 업데이트 빈도 최소화
    const shouldSummarize: boolean = expelledTurns > 0 && expelledTurns % SUMMARY_BATCH_TURNS === 0;
    if (shouldSummarize) {
      const prevTurns: number = expelledTurns - SUMMARY_BATCH_TURNS;
      const batchStart: number = this.indexAfterNUserTurns(allExpelled, prevTurns);
      const newBatch: ChatMessage[] = allExpelled.slice(batchStart);

      const newSummary = await this.generateSummary(newBatch, summary, provider, apiKey, modelName);
      if (newSummary) {
        summary = newSummary;
        await this.chatManagementService.updateDoc(conversationId, ownerUserId, { summary });
      }
    }

    // 아직 요약에 포함되지 않은 Pending expelled 계산
    // summary가 있다면 floor(expelledTurns / BATCH_TURNS) * BATCH_TURNS 개의 턴을 커버한다고 가정
    const summarizedTurns = summary
      ? Math.floor(expelledTurns / SUMMARY_BATCH_TURNS) * SUMMARY_BATCH_TURNS
      : 0;
    const pendingStart = this.indexAfterNUserTurns(allExpelled, summarizedTurns);
    const pendingExpelled = allExpelled.slice(pendingStart);

    return buildResult([...pendingExpelled, ...windowMessages]);
  }

  /**
   * AI 챗 메시지를 처리하는 핵심 메서드
   *
   * @param ownerUserId 사용자 ID
   * @param chatbody AI 챗 메시지
   * @param conversationId 대화방 ID
   * @param files 첨부파일
   * @param onStream 스트리밍 콜백
   * @returns AI 챗 응답
   * @throws {ValidationError} VALIDATION_FAILED — 지원하지 않는 모델
   * @throws {ProviderRateLimitError} RATE_LIMITED — AI 공급자 속도 제한
   * @throws {InsufficientCreditError} INSUFFICIENT_CREDIT — 크레딧 부족
   * @throws {UpstreamError} UPSTREAM_ERROR — AI 생성 실패
   */
  async handleAIChat(
    ownerUserId: string,
    chatbody: AIchatType,
    conversationId: string,
    files?: Express.Multer.File[],
    onStream?: (chunk: string) => void
  ): Promise<AIChatResponseDto> {
    try {
      // 1. 파일 업로드 (S3 저장 및 첨부파일 메타데이터 생성)
      const userAttachments: Attachment[] = await this.handleFiles(files);

      // 2. 서비스 자체 API 키 조회 & Provider 획득
      const apiKey = this.getSystemApiKey(chatbody.model);
      let provider: IAiProvider;
      try {
        provider = getAiProvider(chatbody.model);
      } catch (e) {
        throw new ValidationError(`Unsupported AI model: ${chatbody.model}`);
      }

      // 3. 대화방 조회 또는 생성
      let conversation: ChatThread;
      let isNewConversation = false;
      let newTitle: string | null = null;

      try {
        conversation = await this.chatManagementService.getConversation(
          conversationId,
          ownerUserId
        );
      } catch (err: any) {
        if (err.code === 'NOT_FOUND' || err instanceof NotFoundError) {
          isNewConversation = true;
          const preferredLanguage = await this.userService.getPreferredLanguage(ownerUserId);
          const titleRequest = await withRetry(
            async () =>
              await provider.requestGenerateThreadTitle(apiKey, chatbody.chatContent, {
                language: preferredLanguage,
              }),
            { label: 'AiProvider.requestGenerateThreadTitle' }
          );
          newTitle = titleRequest.ok ? titleRequest.data : 'New Conversation';
          conversation = await this.chatManagementService.createConversation(
            ownerUserId,
            conversationId,
            newTitle
          );
        } else throw err;
      }

      // 3-a. [NEW_CONVERSATION 예약어] 웹 클라이언트 전용 제목 자동 생성 경로
      //
      // 배경:
      //   모바일 앱은 로컬 DB를 보유하므로 대화방 생성 시점에 제목을 즉시 결정할 수 있다.
      //   반면 웹 클라이언트는 로컬 DB가 없어 placeholder 제목으로 대화방을 미리 생성해야 한다.
      //   이 시점에서는 사용자가 어떤 메시지를 보낼지 모르므로 의미있는 제목을 만들 수 없다.
      if (!isNewConversation && chatbody.title === 'NEW_CONVERSATION') {
        const preferredLanguage = await this.userService.getPreferredLanguage(ownerUserId);
        const titleRequest = await withRetry(
          async () =>
            await provider.requestGenerateThreadTitle(apiKey, chatbody.chatContent, {
              language: preferredLanguage,
            }),
          { label: 'AiProvider.requestGenerateThreadTitle' }
        );
        newTitle = titleRequest.ok ? titleRequest.data : null;
        if (newTitle) {
          await this.chatManagementService.updateConversation(conversationId, ownerUserId, {
            title: newTitle,
          });
        }
      }

      // 4. 현재 사용자 메시지 구성
      const currentUserChatMessage: ChatMessage = {
        id: chatbody.id,
        role: 'user',
        content: chatbody.chatContent,
        attachments: userAttachments,
      };

      // 5. Sliding Window + 누적 요약 적용하여 컨텍스트 메시지 조립
      const historyMessages: ChatMessage[] =
        await this.chatManagementService.getMessages(conversationId);
      const fullMessages = await this.buildContextMessages(
        historyMessages,
        currentUserChatMessage,
        conversationId,
        ownerUserId,
        conversation.summary,
        provider,
        apiKey,
        chatbody.modelName
      );

      // 6. AI Provider 호출 (ToolContext 포함 — ReAct 루프)
      const toolCtx = this.buildToolCtx();
      const aiResponseResult = await withRetry(
        async () =>
          await provider.generateChat(
            apiKey,
            { model: chatbody.modelName, messages: fullMessages, toolCtx },
            onStream,
            this.storageAdapter
          ),
        { label: 'AiProvider.generateChat' }
      );

      // 응답 오류 처리
      if (!aiResponseResult.ok) {
        if (aiResponseResult.error === 'rate_limited')
          throw new ProviderRateLimitError(
            'AI provider is temporarily rate limited. Please retry after a moment.'
          );
        if (aiResponseResult.error === 'insufficient_credit')
          throw new InsufficientCreditError(
            'AI Generation failed: insufficient credit. Please recharge your account.'
          );
        throw new UpstreamError(`AI Generation failed: ${aiResponseResult.error}`);
      }

      // AI 응답
      const aiResponse: AiResponse = aiResponseResult.data;

      // 7. 메시지 저장
      const userMessage = await this.chatManagementService.createMessage(
        ownerUserId,
        conversationId,
        {
          id: chatbody.id,
          role: 'user',
          content: chatbody.chatContent,
          attachments: userAttachments,
        }
      );

      const aiMessage = await this.chatManagementService.createMessage(
        ownerUserId,
        conversationId,
        {
          role: 'assistant',
          content: aiResponse.content,
          attachments: aiResponse.attachments,
          metadata: aiResponse.metadata,
        }
      );

      captureEvent(ownerUserId, POSTHOG_EVENT.AI_CHAT_COMPLETED, {
        model_name: chatbody.modelName,
        chat_type: 'normal',
        attachments_count: userAttachments.length,
      });

      return { title: newTitle ?? undefined, messages: [userMessage, aiMessage] };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('AiInteractionService.handleAIChat failed', { cause: String(err) });
    }
  }

  /**
   * RAG 기반 AI 챗 메시지 처리
   * FE가 제공한 맥락(retrievedContext)을 시스템 프롬프트 형태로 주입하여 호출합니다.
   * FE가 recentMessages를 직접 제공하므로 서버 측 Sliding Window는 적용하지 않습니다.
   *
   * @param ownerUserId 사용자 ID
   * @param chatbody AI 챗 메시지 (retrievedContext, recentMessages 포함)
   * @param conversationId 대화방 ID
   * @param files 첨부파일
   * @param onStream 스트리밍 콜백
   * @returns AI 챗 응답
   * @throws {ValidationError} VALIDATION_FAILED — 지원하지 않는 모델
   * @throws {ProviderRateLimitError} RATE_LIMITED — AI 공급자 속도 제한
   * @throws {InsufficientCreditError} INSUFFICIENT_CREDIT — 크레딧 부족
   * @throws {UpstreamError} UPSTREAM_ERROR — AI 생성 실패
   */
  async handleRagAIChat(
    ownerUserId: string,
    chatbody: {
      id: string;
      model: ApiKeyModel;
      chatContent: string;
      modelName?: string;
      retrievedContext: ChatMessage[];
      recentMessages: ChatMessage[];
    },
    conversationId: string,
    files?: Express.Multer.File[],
    onStream?: (chunk: string) => void
  ): Promise<AIChatResponseDto> {
    try {
      const userAttachments = await this.handleFiles(files);

      // 1. 서비스 자체 API 키 조회 & Provider 획득
      const apiKey = this.getSystemApiKey(chatbody.model);
      let provider: IAiProvider;
      try {
        provider = getAiProvider(chatbody.model);
      } catch (e) {
        throw new ValidationError(`Unsupported AI model: ${chatbody.model}`);
      }

      // 2. 대화방 조회 또는 생성
      let conversation: ChatThread;
      let isNewConversation = false;

      try {
        conversation = await this.chatManagementService.getConversation(
          conversationId,
          ownerUserId
        );
      } catch (err: any) {
        if (
          err.code === 'NOT_FOUND' ||
          (err instanceof Error && err.name === 'NotFoundError') ||
          err instanceof NotFoundError
        ) {
          isNewConversation = true;
          const preferredLanguage = await this.userService.getPreferredLanguage(ownerUserId);
          const titleRequest = await withRetry(
            async () =>
              await provider.requestGenerateThreadTitle(apiKey, chatbody.chatContent, {
                language: preferredLanguage,
              }),
            { label: 'AiProvider.requestGenerateThreadTitle(RAG)' }
          );
          const newTitle = titleRequest.ok ? titleRequest.data : 'New RAG Conversation';
          conversation = await this.chatManagementService.createConversation(
            ownerUserId,
            conversationId,
            newTitle
          );
        } else throw err;
      }

      // 3. RAG 프롬프트 조립
      const contextText = chatbody.retrievedContext
        .map((m, i) => `[참고 ${i + 1} (${m.role})]: ${m.content}`)
        .join('\n');

      const systemInstruction: ChatMessage = {
        id: 'system-rag',
        role: 'system',
        content: `당신은 제공된 [참고 정보]를 바탕으로 답변하는 비서입니다.
          관련이 없는 질문은 일반적인 지식으로 답변하되, 가능한 제공된 맥락을 최우선으로 하세요.

          [참고 정보]
          ${contextText}`,
      };

      const currentUserMessage: ChatMessage = {
        id: chatbody.id,
        role: 'user',
        content: chatbody.chatContent,
        attachments: userAttachments,
      };

      const fullMessages = [systemInstruction, ...chatbody.recentMessages, currentUserMessage];

      // 4. AI 생성 (ToolContext 포함 — ReAct 루프)
      const toolCtx = this.buildToolCtx();
      const result = await withRetry(
        () =>
          provider.generateChat(
            apiKey,
            { model: chatbody.modelName, messages: fullMessages, toolCtx },
            onStream,
            this.storageAdapter
          ),
        { label: 'AiProvider.generateChat(RAG)' }
      );

      if (!result.ok) {
        if (result.error === 'rate_limited')
          throw new ProviderRateLimitError(
            'AI provider is temporarily rate limited. Please retry after a moment.'
          );
        if (result.error === 'insufficient_credit')
          throw new InsufficientCreditError(
            'AI Generation failed: insufficient credit. Please recharge your account.'
          );
        throw new UpstreamError(`AI Generation failed: ${result.error}`);
      }

      const aiResponse = result.data;

      // 5. DB 저장
      const dbUserMsg = await this.chatManagementService.createMessage(
        ownerUserId,
        conversationId,
        {
          id: chatbody.id,
          role: 'user',
          content: chatbody.chatContent,
          attachments: userAttachments,
        }
      );
      const dbAiMsg = await this.chatManagementService.createMessage(ownerUserId, conversationId, {
        role: 'assistant',
        content: aiResponse.content,
        attachments: aiResponse.attachments,
        metadata: { ...aiResponse.metadata, ragContextCount: chatbody.retrievedContext.length },
      });

      captureEvent(ownerUserId, POSTHOG_EVENT.AI_CHAT_COMPLETED, {
        model_name: chatbody.modelName,
        chat_type: 'rag',
        attachments_count: userAttachments.length,
        context_count: chatbody.retrievedContext.length,
      });

      return {
        title: isNewConversation ? conversation.title : undefined,
        messages: [dbUserMsg, dbAiMsg],
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('AiInteractionService.handleRagAIChat failed', {
        cause: String(err),
      });
    }
  }

  /**
   * AI 챗 재시도 처리
   * 대화방의 가장 최근 AI 응답을 영구 삭제하고, Sliding Window 적용 후 새 응답을 생성합니다.
   *
   * @param ownerUserId 사용자 ID
   * @param retrybody AI 재시도 모델 정보
   * @param conversationId 대화방 ID
   * @param files 추가 첨부파일 (Optional)
   * @param onStream 스트리밍 콜백
   * @returns 새로운 AI 챗 응답
   * @throws {ValidationError} VALIDATION_FAILED — 마지막 메시지가 assistant가 아닌 경우
   * @throws {NotFoundError} NOT_FOUND — 대화방 또는 메시지가 없는 경우
   * @throws {ProviderRateLimitError} RATE_LIMITED — AI 공급자 속도 제한
   * @throws {InsufficientCreditError} INSUFFICIENT_CREDIT — 크레딧 부족
   * @throws {UpstreamError} UPSTREAM_ERROR — AI 생성 실패
   */
  async handleRetryAIChat(
    ownerUserId: string,
    retrybody: { model: ApiKeyModel; modelName?: string },
    conversationId: string,
    files?: Express.Multer.File[],
    onStream?: (chunk: string) => void
  ): Promise<AIChatResponseDto> {
    try {
      // 1. 서비스 자체 API 키 조회 & Provider 획득
      const apiKey = this.getSystemApiKey(retrybody.model);
      let provider: IAiProvider;
      try {
        provider = getAiProvider(retrybody.model);
      } catch (e) {
        throw new ValidationError(`Unsupported AI model: ${retrybody.model}`);
      }

      // 2. 대화방 조회 (없는 경우 에러)
      let conversation: ChatThread;
      try {
        conversation = await this.chatManagementService.getConversation(
          conversationId,
          ownerUserId
        );
      } catch {
        throw new NotFoundError(`Conversation not found for retry: ${conversationId}`);
      }

      // 3. 메시지 기록 조회
      const historyMessages = await this.chatManagementService.getMessages(conversationId);
      if (historyMessages.length === 0) {
        throw new ValidationError('No messages found in the conversation to retry.');
      }

      // 4. 가장 최근 메시지 확인 (AI 메시지인지 검증)
      const lastMessage = historyMessages[historyMessages.length - 1];
      if (lastMessage.role !== 'assistant') {
        throw new ValidationError(
          'The last message in this conversation is not from the assistant. Cannot retry.'
        );
      }

      // 5. 이전 AI 메시지 영구 삭제 (재시도를 위해)
      await this.chatManagementService.deleteMessage(
        ownerUserId,
        conversationId,
        lastMessage.id,
        true
      );

      // 6. 삭제된 메시지를 제외한 내역 구성
      const trimmedHistory = historyMessages.slice(0, historyMessages.length - 1);

      // 추가로 전달된 파일이 있으면 가장 마지막 사용자 메시지에 첨부
      const newAttachments = await this.handleFiles(files);
      if (newAttachments.length > 0 && trimmedHistory.length > 0) {
        const lastUserMessage = trimmedHistory[trimmedHistory.length - 1];
        if (lastUserMessage.role === 'user') {
          lastUserMessage.attachments = [...(lastUserMessage.attachments || []), ...newAttachments];
          await this.chatManagementService.updateMessage(
            ownerUserId,
            conversationId,
            lastUserMessage.id,
            {
              attachments: lastUserMessage.attachments,
            }
          );
        }
      }

      // 7. 마지막 사용자 메시지를 currentMessage로 분리 후 Sliding Window 적용
      const lastUserMsg = trimmedHistory[trimmedHistory.length - 1];
      const prevHistory = trimmedHistory.slice(0, trimmedHistory.length - 1);

      const fullMessages = await this.buildContextMessages(
        prevHistory,
        lastUserMsg,
        conversationId,
        ownerUserId,
        conversation.summary,
        provider,
        apiKey,
        retrybody.modelName
      );

      // 8. AI Provider 호출 (ToolContext 포함 — ReAct 루프)
      const toolCtx = this.buildToolCtx();
      const aiResponseResult = await withRetry(
        async () =>
          await provider.generateChat(
            apiKey,
            { model: retrybody.modelName, messages: fullMessages, toolCtx },
            onStream,
            this.storageAdapter
          ),
        { label: 'AiProvider.generateChat(Retry)' }
      );

      if (!aiResponseResult.ok) {
        if (aiResponseResult.error === 'rate_limited')
          throw new ProviderRateLimitError(
            'AI provider is temporarily rate limited. Please retry after a moment.'
          );
        if (aiResponseResult.error === 'insufficient_credit')
          throw new InsufficientCreditError(
            'AI Generation failed: insufficient credit. Please recharge your account.'
          );
        throw new UpstreamError(`AI Generation retry failed: ${aiResponseResult.error}`);
      }

      const aiResponse: AiResponse = aiResponseResult.data;

      // 9. 새로운 AI 메시지 저장
      const newAiMessage = await this.chatManagementService.createMessage(
        ownerUserId,
        conversationId,
        {
          role: 'assistant',
          content: aiResponse.content,
          attachments: aiResponse.attachments,
          metadata: aiResponse.metadata,
        }
      );

      captureEvent(ownerUserId, POSTHOG_EVENT.AI_CHAT_COMPLETED, {
        model_name: retrybody.modelName,
        chat_type: 'retry',
      });

      return { title: conversation.title, messages: [newAiMessage] };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      throw new UpstreamError('AiInteractionService.handleRetryAIChat failed', {
        cause: String(err),
      });
    }
  }

  /**
   * 파일 다운로드
   * @param key 파일 키
   * @returns 파일 스트림
   */
  async downloadFile(key: string): Promise<Readable> {
    return withRetry(
      async () => await this.storageAdapter.downloadStream(key, { bucketType: 'file' }),
      { label: 'Storage.downloadStream' }
    );
  }

  /**
   * 파일 처리 — 멀티파트 파일을 S3에 업로드하고 Attachment 메타데이터를 반환합니다.
   * @param files Express Multer 파일 배열
   * @returns 업로드된 첨부파일 메타데이터 배열
   */
  private async handleFiles(files?: Express.Multer.File[]): Promise<Attachment[]> {
    if (!files || files.length === 0) return [];

    const attachments: Attachment[] = [];
    for (const file of files) {
      const ext = file.originalname.includes('.') ? '.' + file.originalname.split('.').pop() : '';
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const key = buildStorageKey(STORAGE_BUCKETS.CHAT_FILES, `${uuidv4()}-${date}${ext}`);
      await withRetry(
        async () =>
          await this.storageAdapter.upload(key, file.buffer, file.mimetype, { bucketType: 'file' }),
        { label: 'Storage.upload' }
      );
      attachments.push({
        id: uuidv4(),
        type: file.mimetype.startsWith('image/') ? 'image' : 'file',
        url: key,
        name: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      });
    }
    return attachments;
  }
}
