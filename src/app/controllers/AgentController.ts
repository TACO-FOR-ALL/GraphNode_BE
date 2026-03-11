/**
 * 모듈: AgentController
 *
 * 책임:
 * - 에이전트 채팅 관련 HTTP 요청 처리
 * - SSE 스트림 설정 및 AgentService 위임
 */
import type { Request, Response } from 'express';
import OpenAI from 'openai';

import { AgentService } from '../../core/services/AgentService';
import { getUserIdFromRequest } from '../utils/request';
import type { ChatStreamRequestBody } from '../../shared/dtos/agent';
import type { UserRepository } from '../../core/ports/UserRepository';

export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly userRepository: UserRepository
  ) {}

  /**
   * POST /v1/agent/chat/stream
   * SSE 스트리밍 채팅
   */
  async chatStream(req: Request, res: Response): Promise<void> {
    const { userMessage, contextText, modeHint } = req.body as ChatStreamRequestBody;

    const trimmedUser = (userMessage || '').trim();
    if (!trimmedUser) {
      this.sendEventAndEnd(res, 'error', { message: '메시지를 입력해주세요.' });
      return;
    }

    const userId = getUserIdFromRequest(req)!;
    const userApiKey = await this.userRepository.findApiKeyById(userId, 'openai');

    if (!userApiKey) {
      this.sendEventAndEnd(res, 'error', { message: 'no api key' });
      return;
    }

    const openai = new OpenAI({ apiKey: userApiKey });
    const { sendEvent } = this.setupSSE(res);

    try {
      await this.agentService.handleChatStream(
        userId,
        { userMessage: trimmedUser, contextText: contextText?.trim(), modeHint },
        openai,
        sendEvent
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendEvent('status', { phase: 'error', message: '에러 발생' });
      sendEvent('error', { message });
    } finally {
      res.end();
    }
  }

  private setupSSE(res: Response) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    return { sendEvent };
  }

  private sendEventAndEnd(res: Response, event: string, data: unknown): void {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    res.end();
  }
}
