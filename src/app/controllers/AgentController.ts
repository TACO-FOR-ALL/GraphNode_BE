/**
 * 모듈: AgentController
 *
 * 책임:
 * - 에이전트 채팅 관련 HTTP 요청 처리
 * - SSE 스트림 설정 및 AgentService 위임
 */
import type { Request, Response } from 'express';
import { AgentService } from '../../core/services/AgentService';
import { getUserIdFromRequest } from '../utils/request';
import type { ChatStreamRequestBody } from '../../shared/dtos/agent';

export class AgentController {
  // AgentController 생성자에서, UserRepository 안가지게 수정
  constructor(private readonly agentService: AgentService) {}

  /**
   * POST /v1/agent/chat/stream
   * SSE 스트리밍 채팅
   */
  async chatStream(req: Request, res: Response): Promise<void> {
    const { userMessage, contextText, modeHint } = req.body as ChatStreamRequestBody;

    // 사용자 메시지 검증
    const trimmedUser = (userMessage || '').trim();
    if (!trimmedUser) {
      this.sendErrorAndEnd(res, '메시지를 입력해주세요.');
      return;
    }

    // 사용자 ID 검증
    const userId = getUserIdFromRequest(req)!;

    //FIXME TODO(강현일) : 무조건 openai로하는거 좀 문제가 있을수도? 채팅 대화처럼 다른 모델도 지원하게 하던가..
    // 그리고 Controller 단에서 직접 userRepository 만지게 안하게끔. AgentService에 UserService 주입하는 식으로 수정.
    //const userApiKey = await this.userRepository.findApiKeyById(userId, 'openai');

    // if (!userApiKey) {
    //   this.sendEventAndEnd(res, 'error', { message: 'no api key' });
    //   return;
    // }

    //FIXED(강현일) : 여기서 직접 OpenAI 호출하는게 아니라, shared/ai-providers/openai.ts에 이미 구현체과 핵심 메서드 정의된 것을 쓰는게 적합함
    // const openai = new OpenAI({ apiKey: userApiKey });
    const { sendEvent } = this.setupSSE(res);

    try {
      // FIXED(강현일) : AgentService가 내부에서 UserService를 통해 API Key를 조회하고 AI 호출을 관리합니다.
      await this.agentService.handleChatStream(
        userId,
        { userMessage: trimmedUser, contextText: contextText?.trim(), modeHint },
        sendEvent
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 에러 발생 시 상태 업데이트 및 에러 이벤트 전송
      sendEvent('status', { phase: 'error', message: '에러 발생' });
      sendEvent('error', { message });
    } finally {
      // 성공 또는 실패 여부에 관계없이 최종적으로 응답을 종료합니다.
      // res.writableEnded는 응답이 종료된 상태를 나타내는 boolean 값
      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  /**
   * SSE 스트림 설정
   * @param res Express Response 객체
   * @returns SendEventFn 타입의 sendEvent 함수
   */
  private setupSSE(res: Response) {
    // SSE 설정,
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    /**
     * SSE 이벤트 전송
     * @param event 이벤트 타입
     * @param data 이벤트 데이터
     */
    const sendEvent = (event: string, data: unknown) => {
      // 이미 응답이 종료된 경우, 이벤트 전송을 중단합니다.
      //res.writableEnded는 응답이 종료된 상태를 나타내는 boolean 값
      if (res.writableEnded) return;
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    return { sendEvent };
  }

  /**
   * 에러 메시지 전송 후 SSE 스트림 즉시 종료
   * @param res Express Response 객체
   * @param message 에러 메시지
   */
  private sendErrorAndEnd(res: Response, message: string): void {
    const { sendEvent } = this.setupSSE(res);
    sendEvent('error', { message });
    res.end();
  }
}
