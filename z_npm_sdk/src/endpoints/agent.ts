// endpoints/agent.ts
import { RequestBuilder, type FetchLike } from '../http-builder.js';
import { getGraphNodeBaseUrl } from '../config.js';

// ---------------------------------------------------------------------------
// Primitive Types
// ---------------------------------------------------------------------------

/**
 * 에이전트가 최종 선택한 처리 모드.
 *
 * | 값 | 의미 |
 * |---|---|
 * | `'chat'` | 일반 질의응답 / 데이터 검색 (Function Calling 포함) |
 * | `'summary'` | 주어진 텍스트 요약 |
 * | `'note'` | 주어진 텍스트를 구조화된 노트로 변환 |
 */
export type AgentChatMode = 'chat' | 'summary' | 'note';

/**
 * 서버 분류기에게 권장할 모드 힌트.
 * 분류기가 최종 모드를 결정하기 전에 이 값을 우선 적용합니다 (`irrelevant` 판정 시 무시).
 */
export type AgentChatModeHint = 'summary' | 'note' | 'auto';

// ---------------------------------------------------------------------------
// SSE Event Data Types
// ---------------------------------------------------------------------------

/**
 * `status` 이벤트 페이로드 — 에이전트의 현재 처리 단계.
 *
 * ### 서버가 실제로 전송하는 `phase` 값
 *
 * | phase | 설명 | 발생 조건 |
 * |---|---|---|
 * | `'analyzing'` | 요청 분류 시작 / 완료 | 스트림 시작 직후(1회), 분류기 완료 후(1회) — 총 2회 |
 * | `'searching'` | Function Calling 도구 실행 중 | chat 모드에서 AI가 도구를 호출할 때마다 |
 * | `'done'` | 처리 완료 | 각 모드 정상 종료 시 |
 * | `'error'` | 에러 발생 | `error` 이벤트 직전에 전송됨 |
 *
 * @example
 * // chat 모드 + 도구 호출 있음 — status 이벤트 순서
 * // 1. { phase: 'analyzing', message: '요청 분석 중...' }
 * // 2. { phase: 'analyzing', message: '요청 분석 완료 (mode = chat)' }
 * // 3. { phase: 'searching', message: '데이터 검색 중...' }  ← 도구 호출 시에만
 * // 4. { phase: 'done',      message: '응답 생성 완료' }
 */
export type StreamStatusEvent = {
  /** 현재 처리 단계 식별자 */
  phase: 'analyzing' | 'searching' | 'done' | 'error' | string;
  /** 사람이 읽을 수 있는 단계 설명 메시지 */
  message: string;
};

/**
 * `chunk` 이벤트 페이로드 — 실시간 텍스트 조각.
 *
 * @remarks
 * 모드별 전송 방식:
 * - **chat**: OpenAI 스트리밍으로 답변 조각을 **여러 번** 전송
 * - **summary**: OpenAI 스트리밍으로 요약 조각을 **여러 번** 전송
 * - **note**: OpenAI 스트리밍으로 조각을 **여러 번** 전송 — `text`를 누적해야 전체가 됩니다
 */
export type StreamChunkEvent = {
  /** 응답 텍스트 조각 */
  text: string;
};

/**
 * `result` 이벤트 페이로드 — 스트림 최종 결과.
 *
 * @remarks
 * `onResult` 콜백은 모든 모드(`chat`·`summary`·`note`)가 정상 완료되었을 때 최종 결과를 반환하며 호출됩니다.
 *
 * @example
 * // note 모드 — noteContent 마크다운 코드펜스 제거 예시
 * onResult: ({ mode, noteContent }) => {
 *   if (mode === 'note' && noteContent) {
 *     const cleaned = noteContent
 *       .trim()
 *       .replace(/^```(markdown|md)?\s*\n?/i, '')
 *       .replace(/\n?```\s*$/, '')
 *       .trim();
 *     saveNote(cleaned);
 *   }
 * }
 */
export type StreamResultEvent = {
  /** 에이전트가 최종 결정한 처리 모드 */
  mode: AgentChatMode;
  /** 최종 응답 텍스트 (chat: AI 답변 전문, note: 노트 전문) */
  answer: string;
  /** 생성된 노트 전문. `note` 모드일 때만 값이 있으며 `answer`와 동일. 나머지는 `null` */
  noteContent: string | null;
};

/**
 * `error` 이벤트 페이로드.
 */
export type StreamErrorEvent = {
  /** 에러 메시지 */
  message: string;
};

// ---------------------------------------------------------------------------
// Discriminated Union — Low-level Single Handler Type
// ---------------------------------------------------------------------------

/**
 * `openChatStream` / `openAgentChatStream`에서 사용하는 저수준 SSE 이벤트 타입.
 *
 * 각 이벤트 데이터 타입의 상세 설명:
 * - `status` → {@link StreamStatusEvent}
 * - `chunk` → {@link StreamChunkEvent}
 * - `result` → {@link StreamResultEvent}
 * - `error` → {@link StreamErrorEvent}
 */
export type AgentChatStreamEvent =
  | { event: 'status'; data: StreamStatusEvent }
  | { event: 'chunk'; data: StreamChunkEvent }
  | { event: 'result'; data: StreamResultEvent }
  | { event: 'error'; data: StreamErrorEvent };

// ---------------------------------------------------------------------------
// Request / Callback Types
// ---------------------------------------------------------------------------

/**
 * 에이전트 채팅 스트림 API 요청 파라미터.
 *
 * @example
 * // 일반 채팅
 * const params: AgentChatStreamParams = { userMessage: '최근 회의를 정리해줘' };
 *
 * // Microscope 뷰에서 워크스페이스 기반 RAG 채팅
 * const params: AgentChatStreamParams = {
 *   userMessage: '이 그래프의 핵심 개념은?',
 *   microscopeGroupId: 'ws_01JXXXXXXXXXXXXX',
 * };
 */
export interface AgentChatStreamParams {
  /** 사용자 입력 메시지. 공백만 있으면 서버에서 400 반환 */
  userMessage: string;
  /** (선택) 에이전트에게 전달할 추가 맥락 텍스트 */
  contextText?: string;
  /**
   * (선택) 모드 힌트. 서버 분류기보다 우선 적용됨 (단, `irrelevant` 판정은 덮을 수 없음)
   */
  modeHint?: AgentChatModeHint;
  /**
   * (선택) Microscope 워크스페이스 ID.
   *
   * @remarks
   * 이 값이 존재하면 서버는 **MICROSCOPE CONTEXT MODE**를 활성화합니다.
   * AI가 답변 전에 반드시 `get_microscope_context` 도구를 먼저 호출하여
   * 해당 워크스페이스의 지식 그래프를 우선 근거로 사용합니다.
   *
   * Microscope 뷰 화면에서 채팅을 시작할 때만 전달하세요.
   */
  microscopeGroupId?: string;
}

/**
 * `chatStream` 메서드에 전달하는 이벤트별 콜백 모음.
 *
 * 필요한 이벤트의 콜백만 선택적으로 정의할 수 있습니다.
 *
 * @example
 * const callbacks: StreamEventCallbacks = {
 *   onStatus: ({ phase, message }) => updateProgressBar(phase, message),
 *   onChunk:  ({ text }) => appendToResponseBox(text),
 *   onResult: ({ mode, answer, noteContent }) => {
 *     setFinalAnswer(answer);
 *     if (mode === 'note' && noteContent) createNote(noteContent);
 *   },
 *   onError:  ({ message }) => showErrorToast(message),
 * };
 */
export type StreamEventCallbacks = {
  /**
   * 에이전트 처리 단계가 변경될 때 호출됩니다.
   * 진행 상태 표시줄(Progress Indicator) 업데이트에 활용하세요.
   */
  onStatus?: (event: StreamStatusEvent) => void;
  /**
   * 응답 텍스트 조각을 수신할 때마다 호출됩니다.
   * note 모드에서는 여러 번 호출되므로 텍스트를 누적해야 합니다.
   */
  onChunk?: (event: StreamChunkEvent) => void;
  /**
   * 최종 결과를 수신했을 때 호출됩니다.
   * `chat`, `summary`, `note` 모든 모드에서 완료 시 호출됩니다.
   */
  onResult?: (event: StreamResultEvent) => void;
  /**
   * 서버 또는 스트림 파싱 중 에러가 발생했을 때 호출됩니다.
   * 이 콜백 호출 후 `chatStream`의 Promise가 reject됩니다.
   */
  onError?: (event: StreamErrorEvent) => void;
};

/** `openChatStream` / `openAgentChatStream`의 저수준 이벤트 핸들러 타입 */
export type AgentChatStreamHandler = (event: AgentChatStreamEvent) => void;

// ---------------------------------------------------------------------------
// Internal SSE Helpers
// ---------------------------------------------------------------------------

/**
 * SSE 블록 텍스트(`event:\ndata:\n` 사이)를 파싱합니다.
 * @internal
 */
function _parseSseBlock(rawBlock: string): { eventName: string; data: unknown } | null {
  const lines = rawBlock.split('\n');
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('event:')) {
      eventName = trimmed.slice('event:'.length).trim();
    } else if (trimmed.startsWith('data:')) {
      dataLines.push(trimmed.slice('data:'.length).trim());
    }
  }

  if (dataLines.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(dataLines.join('\n') || '{}');
  } catch {
    parsed = { raw: dataLines.join('\n') };
  }

  return { eventName, data: parsed };
}

/**
 * SSE Response를 읽으며 콜백을 호출하고, 완료 시 최종 result를 반환합니다.
 * `chatStream` 고수준 메서드에서 사용합니다.
 * @internal
 */
async function _readStreamWithCallbacks(
  res: Response,
  callbacks: StreamEventCallbacks,
  signal?: AbortSignal
): Promise<StreamResultEvent | null> {
  if (!res.body) return null;

  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: StreamResultEvent | null = null;

  if (signal) {
    signal.addEventListener('abort', () => reader.cancel());
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        const parsed = _parseSseBlock(rawEvent);
        if (!parsed) continue;

        const { eventName, data } = parsed;

        if (eventName === 'status') {
          callbacks.onStatus?.(data as StreamStatusEvent);
        } else if (eventName === 'chunk') {
          callbacks.onChunk?.(data as StreamChunkEvent);
        } else if (eventName === 'result') {
          finalResult = data as StreamResultEvent;
          callbacks.onResult?.(finalResult);
        } else if (eventName === 'error') {
          callbacks.onError?.(data as StreamErrorEvent);
          throw new Error((data as StreamErrorEvent).message);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return finalResult;
}

/**
 * SSE Response를 읽으며 단일 onEvent 핸들러를 호출합니다.
 * `openChatStream` 저수준 메서드에서 사용합니다.
 * @internal
 */
function _readStreamWithHandler(
  res: Response,
  onEvent: AgentChatStreamHandler,
  controller: AbortController
): void {
  if (!res.body) return;

  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  controller.signal.addEventListener('abort', () => reader.cancel());

  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const parsed = _parseSseBlock(rawEvent);
          if (!parsed) continue;

          const { eventName, data } = parsed;

          if (eventName === 'status') {
            onEvent({ event: 'status', data: data as StreamStatusEvent });
          } else if (eventName === 'chunk') {
            onEvent({ event: 'chunk', data: data as StreamChunkEvent });
          } else if (eventName === 'result') {
            onEvent({ event: 'result', data: data as StreamResultEvent });
          } else if (eventName === 'error') {
            onEvent({ event: 'error', data: data as StreamErrorEvent });
          } else {
            onEvent({ event: 'status', data: { phase: eventName, message: JSON.stringify(data) } });
          }
        }
      }
    } catch (e: any) {
      if (!controller.signal.aborted) {
        onEvent({ event: 'error', data: { message: e?.message ?? 'stream_error' } });
      }
    } finally {
      reader.releaseLock();
    }
  })();
}

// ---------------------------------------------------------------------------
// AgentApi Class (RequestBuilder 패턴 — client.agent 로 사용)
// ---------------------------------------------------------------------------

/**
 * GraphNode AI 에이전트 채팅 API.
 *
 * `client.agent`를 통해 사용합니다. `RequestBuilder`를 공유하므로
 * 인증(쿠키·AccessToken), 기본 헤더, 자동 토큰 갱신이 자동으로 적용됩니다.
 *
 * ---
 *
 * ### `chatStream` vs `openChatStream` — 어떻게 다른가?
 *
 * | | `chatStream` | `openChatStream` |
 * |---|---|---|
 * | **Promise 해결 시점** | 스트림이 **완전히 종료**될 때 | fetch가 완료되어 **스트림이 시작**될 때 |
 * | **반환값** | `StreamResultEvent \| null` (최종 결과) | `() => void` (cancel 함수) |
 * | **콜백 인터페이스** | 이벤트별 분리 콜백: `onStatus`, `onChunk`, `onResult`, `onError` | 단일 discriminated-union 핸들러: `onEvent` |
 * | **사용 패턴** | `await client.agent.chatStream(...)` — 순차적 처리에 적합 | 백그라운드 스트림, 즉시 cancel 함수가 필요할 때 |
 *
 * 대부분의 경우 `chatStream`을 사용하세요.
 * cancel 함수가 즉시 필요하거나 이벤트를 단일 핸들러로 처리하려면 `openChatStream`을 사용하세요.
 *
 * @public
 */
export class AgentApi {
  constructor(private readonly rb: RequestBuilder) {}

  /**
   * AI 에이전트와 스트리밍 채팅을 수행합니다. **(고수준 — 스트림 완료까지 `await`)**
   *
   * 서버의 `POST /v1/agent/chat/stream` SSE 엔드포인트에 연결하고,
   * 각 이벤트 타입에 맞는 콜백을 호출한 뒤, 스트림이 완전히 종료되면 Promise를 resolve합니다.
   *
   * @remarks
   * ### 에이전트 처리 흐름
   * ```
   * 클라이언트 요청
   *   → status(analyzing)   : 요청 분류 시작
   *   → status(analyzing)   : 분류 완료 (mode = chat | summary | note)
   *   → [status(searching)] : Function Calling 도구 실행 시 (chat 모드만)
   *   → chunk(text)...      : 응답 텍스트 스트리밍
   *   → status(done)        : 처리 완료
   *   → [result]            : 최종 결과 (모든 모드에서 전송됨)
   * ```
   *
   * ### 모드별 이벤트 차이
   * | 모드 | chunk 전송 방식 | result 이벤트 |
   * |---|---|---|
   * | `chat` | 스트리밍 조각 여러 번 | 전송됨 (`noteContent: null`) |
   * | `summary` | 스트리밍 조각 여러 번 | 전송됨 (`noteContent: null`) |
   * | `note` | 스트리밍 조각 여러 번 | 전송됨 (`noteContent` = 노트 전문) |
   *
   * ### 예외 및 특수 상황 (Edge Cases)
   * - **무관계 질문 (`irrelevant` 판정)**: 사용자의 질문이 서비스 맥락과 전혀 관계없는 경우, 서버 분류기가 `irrelevant` 모드로 자동 판정합니다. 이 경우 거절 메시지가 실시간으로 스트리밍되며 최종 완료 시 `result` 이벤트가 정상 수신됩니다. 또한 차감되었던 크레딧은 서버 백엔드 내에서 자동으로 즉시 환불(`refund`)됩니다.
   * - **인증 만료 또는 유효하지 않은 요청**: 비로그인 상태이거나 `userMessage`가 공백일 경우 `onError` 콜백이 트리거된 후 Promise가 reject됩니다.
   *
   * @param params - 요청 파라미터 및 이벤트 콜백
   *   - `userMessage`: 사용자 입력 메시지
   *   - `contextText`: (선택) 추가 맥락 텍스트
   *   - `modeHint`: (선택) 모드 힌트
   *   - `microscopeGroupId`: (선택) Microscope 워크스페이스 ID
   *   - `callbacks.onStatus`: 처리 단계 변경 콜백
   *   - `callbacks.onChunk`: 텍스트 조각 수신 콜백
   *   - `callbacks.onResult`: 최종 결과 수신 콜백
   *   - `callbacks.onError`: 에러 발생 콜백 (호출 후 Promise reject)
   * @param options - (선택) `signal`: 스트림 취소용 AbortSignal
   * @returns 스트림 종료 시 `StreamResultEvent` (취소 시 `null`)
   * @throws {Error} HTTP 요청 실패 또는 서버 `error` 이벤트 수신 시
   *
   * **응답 상태 코드:**
   * - `200 OK`: SSE 스트림 연결 성공
   * - `400 Bad Request`: `userMessage`가 비어있거나 형식 오류
   * - `401 Unauthorized`: 인증되지 않은 요청
   * - `403 Forbidden`: AI 공급자 API 키가 설정되지 않음
   * - `429 Too Many Requests`: 일일 에이전트 한도 초과 — 재시도 불가
   * - `502 Bad Gateway`: AI 공급자 오류 (재시도 가능)
   *
   * @example
   * // 기본 채팅
   * const result = await client.agent.chatStream({
   *   userMessage: '최근 노트를 요약해줘',
   *   callbacks: {
   *     onStatus: ({ phase, message }) => console.log(`[${phase}] ${message}`),
   *     onChunk:  ({ text }) => appendToUI(text),
   *     onResult: ({ answer }) => finalize(answer),
   *     onError:  ({ message }) => showError(message),
   *   },
   * });
   *
   * @example
   * // Microscope 워크스페이스 기반 RAG 채팅
   * const result = await client.agent.chatStream({
   *   userMessage: '이 그래프에서 핵심 개념을 찾아줘',
   *   microscopeGroupId: activeWorkspaceId,
   *   callbacks: {
   *     onChunk:  ({ text }) => appendToUI(text),
   *     onResult: ({ answer }) => finalize(answer),
   *   },
   * });
   *
   * @example
   * // AbortController로 취소
   * const ctrl = new AbortController();
   * setTimeout(() => ctrl.abort(), 10_000);
   * await client.agent.chatStream(
   *   { userMessage: '노트 검색해줘', callbacks: { onChunk: ({ text }) => appendToUI(text) } },
   *   { signal: ctrl.signal }
   * );
   *
   * @example
   * // try-catch를 이용한 에러 예외 처리
   * try {
   *   await client.agent.chatStream({
   *     userMessage: '유효한 질문 내용',
   *     callbacks: {
   *       onChunk: ({ text }) => console.log(text),
   *       onError: ({ message }) => console.error('이벤트 에러:', message),
   *     }
   *   });
   * } catch (error) {
   *   console.error('HTTP 요청 에러 또는 스트림 실패:', error);
   * }
   */
  async chatStream(
    { callbacks, ...params }: AgentChatStreamParams & { callbacks: StreamEventCallbacks },
    options?: { signal?: AbortSignal }
  ): Promise<StreamResultEvent | null> {
    const res = await this.rb
      .path('/v1/agent/chat/stream')
      .sendRaw('POST', params, { Accept: 'text/event-stream' });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`agent chatStream failed: ${res.status} ${text}`);
    }

    return _readStreamWithCallbacks(res, callbacks, options?.signal);
  }

  /**
   * AI 에이전트 채팅 SSE 스트림을 엽니다. **(저수준 — fetch 직후 cancel 함수 반환)**
   *
   * 스트림을 백그라운드에서 읽으면서 모든 이벤트를 단일 `onEvent` 핸들러의
   * Discriminated Union으로 전달합니다.
   * Promise는 fetch가 완료된 직후(스트림 시작 시점)에 resolve되며 cancel 함수를 반환합니다.
   *
   * @remarks
   * 스트림 완료를 `await`로 기다리거나 이벤트별 콜백이 필요하다면 {@link chatStream}을 사용하세요.
   * 이 메서드는 즉시 cancel 함수가 필요하거나, 이벤트를 단일 switch문으로 처리하려는 경우에 적합합니다.
   *
   * @param params - 요청 파라미터 (`microscopeGroupId` 포함 가능)
   * @param onEvent - 모든 SSE 이벤트를 수신하는 단일 핸들러
   * @param options - (선택) `signal`: 스트림 취소용 AbortSignal
   * @returns cancel 함수 — 호출 시 스트림 읽기를 중단합니다
   *
   * @example
   * const cancel = await client.agent.openChatStream(
   *   { userMessage: '내 노트 요약해줘', microscopeGroupId: 'ws_01JXX' },
   *   (ev) => {
   *     switch (ev.event) {
   *       case 'status': updateProgress(ev.data.phase, ev.data.message); break;
   *       case 'chunk':  appendText(ev.data.text); break;
   *       case 'result': finalize(ev.data.answer); break;
   *       case 'error':  showError(ev.data.message); break;
   *     }
   *   }
   * );
   * // 필요 시: cancel();
   */
  async openChatStream(
    params: AgentChatStreamParams,
    onEvent: AgentChatStreamHandler,
    options?: { signal?: AbortSignal }
  ): Promise<() => void> {
    const controller = new AbortController();
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    this.rb
      .path('/v1/agent/chat/stream')
      .sendRaw('POST', params, { Accept: 'text/event-stream' })
      .then((res) => {
        _readStreamWithHandler(res, onEvent, controller);
      })
      .catch((e: any) => {
        if (!controller.signal.aborted) {
          onEvent({ event: 'error', data: { message: e?.message ?? 'stream_error' } });
        }
      });

    return () => controller.abort();
  }
}

/**
 * `AgentChatStreamOptions` — 독립형 standalone 함수 전용 옵션.
 *
 * `AgentApi` 클래스 메서드는 `RequestBuilder`를 통해 fetch를 주입받으므로 이 타입을 사용하지 않습니다.
 */
export interface AgentChatStreamOptions {
  /**
   * 커스텀 fetch 구현체.
   * Node 16 이하 환경이나 테스트 Mock에 사용합니다.
   * 미제공 시 `window.fetch` 또는 `globalThis.fetch`를 자동 사용합니다.
   */
  fetchImpl?: FetchLike;
  /** 스트림 취소용 `AbortSignal` */
  signal?: AbortSignal;
}
