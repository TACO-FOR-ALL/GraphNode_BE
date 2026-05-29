import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import OpenAI from 'openai';

import { AgentService, AgentServiceDeps } from '../../src/core/services/AgentService';
import { UserService } from '../../src/core/services/UserService';
import { NoteService } from '../../src/core/services/NoteService';
import { ConversationService } from '../../src/core/services/ConversationService';
import { MessageService } from '../../src/core/services/MessageService';
import { GraphEmbeddingService } from '../../src/core/services/GraphEmbeddingService';
import { GraphVectorService } from '../../src/core/services/GraphVectorService';
import { SearchService } from '../../src/core/services/SearchService';
import { ICreditService } from '../../src/core/ports/ICreditService';

// Mock OpenAI
const mockCompletionsCreate = jest.fn() as jest.Mock<any>;
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => {
    return {
      chat: {
        completions: {
          create: mockCompletionsCreate,
        },
      },
    };
  });
});

// Mock loadEnv
jest.mock('../../src/config/env', () => ({
  loadEnv: () => ({
    OPENAI_API_KEY: 'test-api-key',
  }),
}));

// Mock billing.config FEATURE_COSTS for AGENT_CHAT to consume credits in tests
jest.mock('../../src/config/billing.config', () => {
  const original = jest.requireActual('../../src/config/billing.config') as any;
  return {
    ...original,
    FEATURE_COSTS: {
      ...original.FEATURE_COSTS,
      AGENT_CHAT: {
        calculate: () => 10,
      },
    },
  };
});

describe('AgentService', () => {
  let agentService: AgentService;
  let deps: any;
  let sendEvent: any;

  beforeEach(() => {
    jest.clearAllMocks();

    deps = {
      userService: {
        getApiKeys: jest.fn(),
      } as any,
      noteService: {
        createNote: jest.fn(),
      } as any,
      conversationService: {} as any,
      messageService: {} as any,
      graphEmbeddingService: {} as any,
      graphVectorService: {} as any,
      searchService: {} as any,
      creditService: {
        deduct: jest.fn(),
        refund: jest.fn(),
      } as any,
    } as any;

    agentService = new AgentService(deps);
    sendEvent = jest.fn();
  });

  it('irrelevant 모드로 판정된 경우, 거절 응답을 보내고 refund 처리가 수행되어야 함', async () => {
    // 1. Classifier Mock (irrelevant 모드 반환)
    mockCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ mode: 'irrelevant', rejectionMessage: '에이전트와 관계없는 질문입니다.' }) } }],
    });

    deps.creditService!.deduct.mockResolvedValueOnce(10); // 10 크레딧 차감 가정

    await agentService.handleChatStream(
      'user_1',
      { userMessage: '짜장면 레시피 알려줘' },
      sendEvent
    );

    // 이벤트 전송 내역 검증
    expect(sendEvent).toHaveBeenCalledWith('status', { phase: 'analyzing', message: '요청 분석 중...' });
    expect(sendEvent).toHaveBeenCalledWith('status', { phase: 'analyzing', message: '요청 분석 완료 (mode = irrelevant)' });
    expect(sendEvent).toHaveBeenCalledWith('chunk', { text: '에이전트와 관계없는 질문입니다.' });
    expect(sendEvent).toHaveBeenCalledWith('status', { phase: 'done', message: '답변 불가' });
    expect(sendEvent).toHaveBeenCalledWith('result', {
      mode: 'chat',
      answer: '에이전트와 관계없는 질문입니다.',
      noteContent: null,
    });

    // 환불 처리 검증
    expect(deps.creditService!.refund).toHaveBeenCalledWith(
      'user_1',
      expect.any(Number),
      expect.stringContaining('irrelevant mode')
    );
  });

  it('summary 모드로 판정된 경우, stream 응답을 받아 전송하고 완료 시 result 이벤트를 전송해야 함', async () => {
    // 1. Classifier Mock (summary 모드 반환)
    mockCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ mode: 'summary' }) } }],
    });

    // 2. Stream Mock (요약본 스트리밍)
    const mockSummaryStream = {
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: '이것은 ' } }] };
        yield { choices: [{ delta: { content: '요약본' } }] };
        yield { choices: [{ delta: { content: '입니다.' } }] };
      },
    };
    mockCompletionsCreate.mockResolvedValueOnce(mockSummaryStream);

    await agentService.handleChatStream(
      'user_1',
      { userMessage: '이 내용을 요약해줘', contextText: '긴 글 내용...' },
      sendEvent
    );

    expect(sendEvent).toHaveBeenCalledWith('status', { phase: 'analyzing', message: '요청 분석 완료 (mode = summary)' });
    expect(sendEvent).toHaveBeenCalledWith('chunk', { text: '이것은 ' });
    expect(sendEvent).toHaveBeenCalledWith('chunk', { text: '요약본' });
    expect(sendEvent).toHaveBeenCalledWith('chunk', { text: '입니다.' });
    expect(sendEvent).toHaveBeenCalledWith('status', { phase: 'done', message: '요약 생성 완료' });
    expect(sendEvent).toHaveBeenCalledWith('result', {
      mode: 'summary',
      answer: '이것은 요약본입니다.',
      noteContent: null,
    });
  });

  it('note 모드로 판정된 경우, stream 응답을 받아 전송하고 완료 시 noteContent를 포함한 result 이벤트를 전송해야 함', async () => {
    // 1. Classifier Mock (note 모드 반환)
    mockCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ mode: 'note' }) } }],
    });

    // 2. Stream Mock (노트 본문 스트리밍)
    const mockNoteStream = {
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: '# 회의록\n' } }] };
        yield { choices: [{ delta: { content: '- 일정 결정' } }] };
      },
    };
    mockCompletionsCreate.mockResolvedValueOnce(mockNoteStream);

    await agentService.handleChatStream(
      'user_1',
      { userMessage: '노트로 정리해줘', contextText: '회의록 데이터...' },
      sendEvent
    );

    expect(sendEvent).toHaveBeenCalledWith('status', { phase: 'analyzing', message: '요청 분석 완료 (mode = note)' });
    expect(sendEvent).toHaveBeenCalledWith('chunk', { text: '# 회의록\n' });
    expect(sendEvent).toHaveBeenCalledWith('chunk', { text: '- 일정 결정' });
    expect(sendEvent).toHaveBeenCalledWith('status', { phase: 'done', message: '노트 생성 완료' });
    expect(sendEvent).toHaveBeenCalledWith('result', {
      mode: 'note',
      answer: '# 회의록\n- 일정 결정',
      noteContent: '# 회의록\n- 일정 결정',
    });
  });

  it('chat 모드에서 Tool Call 없이 대화하는 경우, stream 응답을 받고 완료 시 result 이벤트를 전송해야 함', async () => {
    // 1. Classifier Mock (chat 모드 반환)
    mockCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ mode: 'chat' }) } }],
    });

    // 2. Stream Mock (대화 스트리밍)
    const mockChatStream = {
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: '안녕하세요! ' } }] };
        yield { choices: [{ delta: { content: '반갑습니다.' } }] };
      },
    };
    mockCompletionsCreate.mockResolvedValueOnce(mockChatStream);

    await agentService.handleChatStream(
      'user_1',
      { userMessage: '안녕' },
      sendEvent
    );

    expect(sendEvent).toHaveBeenCalledWith('status', { phase: 'analyzing', message: '요청 분석 완료 (mode = chat)' });
    expect(sendEvent).toHaveBeenCalledWith('chunk', { text: '안녕하세요! ' });
    expect(sendEvent).toHaveBeenCalledWith('chunk', { text: '반갑습니다.' });
    expect(sendEvent).toHaveBeenCalledWith('status', { phase: 'done', message: '응답 생성 완료' });
    expect(sendEvent).toHaveBeenCalledWith('result', {
      mode: 'chat',
      answer: '안녕하세요! 반갑습니다.',
      noteContent: null,
    });
  });

  it('chat 모드에서 Tool Call이 발생하는 경우, 검색 상태 전송 및 도구 호출 후 최종 결과를 스트리밍해야 함', async () => {
    // 1. Classifier Mock (chat 모드 반환)
    mockCompletionsCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ mode: 'chat' }) } }],
    });

    // 2. First Stream Mock (Tool Call 전달)
    const mockToolStream = {
      [Symbol.asyncIterator]: async function* () {
        yield {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'get_recent_notes', arguments: '{}' }
              }]
            }
          }]
        };
      },
    };
    mockCompletionsCreate.mockResolvedValueOnce(mockToolStream);

    // 3. Second Stream Mock (Tool 결과 수신 후 최종 답변 제공)
    const mockFinalStream = {
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: '최근 노트 검색 결과입니다.' } }] };
      },
    };
    mockCompletionsCreate.mockResolvedValueOnce(mockFinalStream);

    // Mock ToolRegistry execution
    const executeSpy = jest.spyOn((agentService as any).toolRegistry, 'execute')
      .mockResolvedValueOnce(JSON.stringify([{ title: '노트1', content: '내용1' }]));

    await agentService.handleChatStream(
      'user_1',
      { userMessage: '최근 노트를 보여줘' },
      sendEvent
    );

    // 상태 변화 검증
    expect(sendEvent).toHaveBeenCalledWith('status', { phase: 'searching', message: '데이터 검색 중...' });
    // 도구 실행 검증
    expect(executeSpy).toHaveBeenCalledWith('get_recent_notes', 'user_1', {}, expect.any(Object), expect.any(Object), expect.any(Object));
    // 최종 텍스트 전송 검증
    expect(sendEvent).toHaveBeenCalledWith('chunk', { text: '최근 노트 검색 결과입니다.' });
    expect(sendEvent).toHaveBeenCalledWith('status', { phase: 'done', message: '응답 생성 완료' });
    expect(sendEvent).toHaveBeenCalledWith('result', {
      mode: 'chat',
      answer: '최근 노트 검색 결과입니다.',
      noteContent: null,
    });
  });
});
