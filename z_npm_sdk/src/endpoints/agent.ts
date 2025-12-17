// endpoints/agent.ts
import { type FetchLike } from '../http-builder.js';
import { GRAPHNODE_BASE_URL } from '../config.js';

/**
 * 에이전트 채팅 모드 및 스트림 이벤트 타입들
 */
export type AgentChatMode = 'chat' | 'summary' | 'note';

/**
 * 사용자에게 제안할 에이전트 채팅 모드 힌트 타입
 */
export type AgentChatModeHint = 'summary' | 'note' | 'auto';

/**
 * 에이전트 채팅 스트림 이벤트 타입들
 */
export type AgentChatStreamEvent =
  | { event: 'status'; data: { phase: string; message: string } }
  | { event: 'chunk'; data: { text: string } }
  | { event: 'result'; data: { mode: AgentChatMode; answer: string; noteContent: string | null } }
  | { event: 'error'; data: { message: string } };

/**
 * 에이전트 채팅 스트림 API 요청 파라미터
 * @property userMessage 사용자 메시지
 * @property contextText (선택) 컨텍스트 텍스트
 * @property modeHint (선택) 에이전트 채팅 모드 힌트
 */
export interface AgentChatStreamParams {
  userMessage: string;
  contextText?: string;
  modeHint?: AgentChatModeHint;
}

export interface AgentChatStreamOptions {
  /**
   * 커스텀 fetch (예: Node 16 환경). 기본은 globalThis.fetch 사용.
   */
  fetchImpl?: FetchLike;
  /**
   * 스트림 취소용 AbortSignal.
   */
  signal?: AbortSignal;
}

export type AgentChatStreamHandler = (event: AgentChatStreamEvent) => void;

/**
 * /v1/agent/chat/stream 스트리밍 API를 여는 헬퍼.
 * - 서버는 text/event-stream(SSE) 형식으로 event/data 를 보낸다.
 * - 이 함수는 fetch + ReadableStream 으로 SSE 프레임을 파싱해서 onEvent에 전달한다.
 *
 * @returns 스트림을 취소하는 cancel 함수
 */
export async function openAgentChatStream(
  params: AgentChatStreamParams,
  onEvent: AgentChatStreamHandler,
  options: AgentChatStreamOptions = {}
): Promise<() => void> {
  const controller = new AbortController();
  const signal = options.signal;

  // 외부에서 signal을 전달하면, 그 signal 취소 시 내부 controller도 취소되도록 연결
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return () => controller.abort();
    }
    signal.addEventListener('abort', () => {
      controller.abort(signal.reason);
    });
  }

  let fetchFn: FetchLike | undefined = options.fetchImpl;
  if (!fetchFn) {
    if (typeof window !== 'undefined' && window.fetch) {
      fetchFn = window.fetch.bind(window);
    } else if (typeof globalThis !== 'undefined' && (globalThis as any).fetch) {
      fetchFn = (globalThis as any).fetch.bind(globalThis);
    } else {
      throw new Error('fetch is not available in this environment. Provide options.fetchImpl.');
    }
  }

  const fetchImpl = fetchFn as FetchLike;

  const url = `${GRAPHNODE_BASE_URL.replace(/\/$/, '')}/v1/agent/chat/stream`;

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    credentials: 'include',
    body: JSON.stringify(params),
    signal: controller.signal,
  } as RequestInit);

  if (!res.body) {
    // 즉시 끝난 경우
    return () => controller.abort();
  }

  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE 프레임 파싱: "event: xxx\ndata: yyy\n\n"
        let idx: number;
        // 한 번에 여러 이벤트가 들어올 수 있으므로 루프
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const lines = rawEvent.split('\n');
          let eventName = 'message';
          let dataLines: string[] = [];

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) {
              eventName = trimmed.slice('event:'.length).trim();
            } else if (trimmed.startsWith('data:')) {
              dataLines.push(trimmed.slice('data:'.length).trim());
            }
          }

          const dataStr = dataLines.join('\n') || '{}';
          let parsed: any;
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            parsed = { raw: dataStr };
          }

          // 타입에 맞춰 onEvent 호출
          if (eventName === 'status') {
            onEvent({ event: 'status', data: parsed });
          } else if (eventName === 'chunk') {
            onEvent({ event: 'chunk', data: parsed });
          } else if (eventName === 'result') {
            onEvent({ event: 'result', data: parsed });
          } else if (eventName === 'error') {
            onEvent({ event: 'error', data: parsed });
          } else {
            // 기타 이벤트는 status로 취급하거나 무시할 수도 있음
            onEvent({ event: 'status', data: { phase: eventName, message: dataStr } });
          }
        }
      }
    } catch (e: any) {
      if (!controller.signal.aborted) {
        onEvent({
          event: 'error',
          data: { message: e?.message ?? 'stream_error' },
        });
      }
    }
  })();

  return () => controller.abort();
}
