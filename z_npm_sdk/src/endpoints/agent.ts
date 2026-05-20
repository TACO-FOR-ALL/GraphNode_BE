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
 * 모드별 전송 방식이 다릅니다:
 * - **chat**: 최종 답변 전체를 **1회** 전송
 * - **summary**: 요약 전체를 **1회** 전송
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
 * **⚠️ summary 모드는 이 이벤트를 전송하지 않습니다.**
 * summary 모드의 결과는 `chunk` 이벤트로만 수신됩니다.
 * `onResult` 콜백은 `chat`·`note` 모드에서만 호출됩니다.
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
   * **⚠️ summary 모드에서는 호출되지 않습니다.** summary 결과는 `onChunk`로 수신하세요.
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
   *   → [result]            : 최종 결과 (chat·note 모드만 전송, summary는 전송 안 함)
   * ```
   *
   * ### 모드별 이벤트 차이
   * | 모드 | chunk 전송 방식 | result 이벤트 |
   * |---|---|---|
   * | `chat` | 최종 답변 전체 1회 | 전송됨 (`noteContent: null`) |
   * | `summary` | 요약 전체 1회 | **전송 안 됨** |
   * | `note` | 스트리밍 조각 여러 번 | 전송됨 (`noteContent` = 노트 전문) |
   *
   * @param params - 요청 파라미터 및 이벤트 콜백
   *   - `userMessage`: 사용자 입력 메시지
   *   - `contextText`: (선택) 추가 맥락 텍스트
   *   - `modeHint`: (선택) 모드 힌트
   *   - `microscopeGroupId`: (선택) Microscope 워크스페이스 ID
   *   - `callbacks.onStatus`: 처리 단계 변경 콜백
   *   - `callbacks.onChunk`: 텍스트 조각 수신 콜백
   *   - `callbacks.onResult`: 최종 결과 수신 콜백 (chat·note 모드만 호출됨)
   *   - `callbacks.onError`: 에러 발생 콜백 (호출 후 Promise reject)
   * @param options - (선택) `signal`: 스트림 취소용 AbortSignal
   * @returns 스트림 종료 시 `StreamResultEvent` (summary 모드 또는 취소 시 `null`)
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
   */
  async chatStream(
    {
      callbacks,
      ...params
    }: AgentChatStreamParams & { callbacks: StreamEventCallbacks },
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

// ---------------------------------------------------------------------------
// Standalone Functions (TacoClient 없이 사용 가능 — 독립 export)
// ---------------------------------------------------------------------------

/** @internal 독립 fetch 환경 resolve */
function _resolveFetch(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) return fetchImpl;
  if (typeof window !== 'undefined' && window.fetch) return window.fetch.bind(window);
  if (typeof globalThis !== 'undefined' && (globalThis as any).fetch) {
    return (globalThis as any).fetch.bind(globalThis);
  }
  throw new Error('fetch is not available. Provide options.fetchImpl.');
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

/**
 * `TacoClient` 인스턴스 없이 에이전트 채팅 스트림을 여는 **독립형 고수준 함수**.
 *
 * `client.agent.chatStream()`과 동일한 기능을 제공하지만,
 * `GraphNodeClient` 없이 `getGraphNodeBaseUrl()` 설정만으로 동작합니다.
 * 단, `RequestBuilder`를 사용하지 않으므로 **AccessToken 자동 갱신이 적용되지 않습니다.**
 * 가능하면 `client.agent.chatStream()`을 사용하세요.
 *
 * @remarks
 * ### `agentChatStream` vs `openAgentChatStream`
 *
 * | | `agentChatStream` | `openAgentChatStream` |
 * |---|---|---|
 * | **Promise 해결 시점** | 스트림이 **완전히 종료**될 때 | fetch 완료 후 **스트림 시작** 시점 |
 * | **반환값** | `StreamResultEvent \| null` (최종 결과) | `() => void` (cancel 함수) |
 * | **콜백 인터페이스** | 이벤트별 콜백: `onStatus`, `onChunk`, `onResult`, `onError` | 단일 핸들러: `onEvent` |
 * | **사용 패턴** | `await agentChatStream(...)` | 백그라운드 스트림 + 즉시 cancel 필요 시 |
 *
 * @param params - 요청 파라미터 + `callbacks` 이벤트 콜백
 * @param options - (선택) `fetchImpl`, `signal`
 * @returns `StreamResultEvent | null`
 *
 * @example
 * import { agentChatStream } from '@taco_tsinghua/graphnode-sdk';
 *
 * const result = await agentChatStream({
 *   userMessage: '최근 회의 내용을 정리해줘',
 *   callbacks: {
 *     onStatus: ({ phase, message }) => console.log(`[${phase}] ${message}`),
 *     onChunk:  ({ text }) => process.stdout.write(text),
 *     onResult: ({ mode, answer }) => console.log('\n최종:', answer),
 *     onError:  ({ message }) => console.error('에러:', message),
 *   },
 * });
 *
 * @example
 * // Microscope 워크스페이스 기반 RAG 채팅
 * await agentChatStream({
 *   userMessage: '이 그래프의 핵심 개념을 찾아줘',
 *   microscopeGroupId: 'ws_01JXXXXXXXXXXXXX',
 *   callbacks: { onChunk: ({ text }) => appendToUI(text) },
 * });
 */
export async function agentChatStream(
  {
    callbacks,
    ...params
  }: AgentChatStreamParams & { callbacks: StreamEventCallbacks },
  options: AgentChatStreamOptions = {}
): Promise<StreamResultEvent | null> {
  const fetchFn = _resolveFetch(options.fetchImpl);
  const url = `${getGraphNodeBaseUrl()}/v1/agent/chat/stream`;

  const controller = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
    } else {
      options.signal.addEventListener('abort', () => controller.abort(options.signal!.reason));
    }
  }

  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    credentials: 'include',
    body: JSON.stringify(params),
    signal: controller.signal,
  } as RequestInit);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`agent-chat-stream failed: ${res.status} ${text}`);
  }

  return _readStreamWithCallbacks(res, callbacks, controller.signal);
}

/**
 * `TacoClient` 인스턴스 없이 에이전트 채팅 SSE 스트림을 여는 **독립형 저수준 함수**.
 *
 * `client.agent.openChatStream()`과 동일한 기능을 제공하지만,
 * `GraphNodeClient` 없이 동작합니다.
 * 단, **AccessToken 자동 갱신이 적용되지 않습니다.**
 * 가능하면 `client.agent.openChatStream()`을 사용하세요.
 *
 * @remarks
 * `agentChatStream`과의 차이점: 위 {@link agentChatStream} JSDoc의 비교표를 참조하세요.
 *
 * @param params - 요청 파라미터
 * @param onEvent - 단일 이벤트 핸들러
 * @param options - (선택) `fetchImpl`, `signal`
 * @returns cancel 함수
 *
 * @example
 * import { openAgentChatStream } from '@taco_tsinghua/graphnode-sdk';
 *
 * const cancel = await openAgentChatStream(
 *   { userMessage: '내 노트 요약해줘', modeHint: 'summary' },
 *   (ev) => {
 *     if (ev.event === 'chunk') process.stdout.write(ev.data.text);
 *     if (ev.event === 'result') console.log('\n완료:', ev.data.answer);
 *   }
 * );
 * // cancel(); // 필요 시 취소
 */
export async function openAgentChatStream(
  params: AgentChatStreamParams,
  onEvent: AgentChatStreamHandler,
  options: AgentChatStreamOptions = {}
): Promise<() => void> {
  const controller = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason);
      return () => controller.abort();
    }
    options.signal.addEventListener('abort', () => controller.abort(options.signal!.reason));
  }

  const fetchFn = _resolveFetch(options.fetchImpl);
  const url = `${getGraphNodeBaseUrl()}/v1/agent/chat/stream`;

  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    credentials: 'include',
    body: JSON.stringify(params),
    signal: controller.signal,
  } as RequestInit);

  _readStreamWithHandler(res, onEvent, controller);

  return () => controller.abort();
}
