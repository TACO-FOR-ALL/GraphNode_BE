import express, { Router } from 'express';
import OpenAI from 'openai';

import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';
import { getUserIdFromRequest } from '../utils/request';
import { ApiKeyModel } from '../../shared/dtos/me';
import { NoteService } from '../../core/services/NoteService';
import { ConversationService } from '../../core/services/ConversationService';
import { MessageService } from '../../core/services/MessageService';
import { GraphEmbeddingService } from '../../core/services/GraphEmbeddingService';
import { GraphVectorService } from '../../core/services/GraphVectorService';

type Mode = 'chat' | 'summary' | 'note';
type ModeHint = 'summary' | 'note' | 'auto';

/**
 * Chat 스트림 요청 바디 타입
 * @property userMessage 사용자 메시지
 * @property contextText (선택) 컨텍스트 텍스트
 * @property modeHint (선택) 에이전트 채팅 모드 힌트
 */
type ChatStreamRequestBody = {
  userMessage: string;
  contextText?: string;
  modeHint?: ModeHint;
};

const agentTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description: '사용자의 노트를 키워드로 검색합니다. 노트 제목이나 내용에서 키워드를 찾습니다.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '검색할 키워드',
          },
          limit: {
            type: 'number',
            description: '반환할 최대 노트 수 (기본값: 5)',
          },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_notes',
      description: '사용자의 최근 노트 목록을 가져옵니다.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: '반환할 최대 노트 수 (기본값: 5)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_conversations',
      description:
        '사용자의 채팅 대화/노드를 의미론적으로 검색합니다. 벡터 유사도 기반으로 관련성 높은 결과를 반환합니다.',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '검색할 질의어 (의미론적 검색)',
          },
          limit: {
            type: 'number',
            description: '반환할 최대 결과 수 (기본값: 5)',
          },
        },
        required: ['keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_conversations',
      description: '사용자의 최근 채팅 대화 목록을 가져옵니다.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: '반환할 최대 대화 수 (기본값: 5)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_graph_summary',
      description: '사용자의 그래프 통계 및 클러스터 정보를 가져옵니다.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_note_content',
      description: '특정 노트의 전체 내용을 가져옵니다.',
      parameters: {
        type: 'object',
        properties: {
          noteId: {
            type: 'string',
            description: '노트 ID',
          },
        },
        required: ['noteId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_conversation_messages',
      description: '특정 대화의 메시지 내용을 가져옵니다.',
      parameters: {
        type: 'object',
        properties: {
          conversationId: {
            type: 'string',
            description: '대화 ID',
          },
          limit: {
            type: 'number',
            description: '반환할 최대 메시지 수 (기본값: 20)',
          },
        },
        required: ['conversationId'],
      },
    },
  },
];

/**
 * /v1/agent 라우터를 생성하는 팩토리 함수.
 */
export function createAgentRouter(deps: {
  userRepository: {
    findApiKeyById(userId: string, provider: ApiKeyModel): Promise<string | null>;
  };
  noteService: NoteService;
  conversationService: ConversationService;
  messageService: MessageService;
  graphEmbeddingService: GraphEmbeddingService;
  graphVectorService: GraphVectorService;
}): Router {
  const router = Router();
  const {
    userRepository,
    noteService,
    conversationService,
    messageService,
    graphEmbeddingService,
    graphVectorService,
  } = deps;

  router.use(bindSessionUser);
  router.use(requireLogin);

  /**
   * SSE 설정 및 이벤트 전송 함수 반환
   */
  function setupSSE(res: express.Response) {
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

  // TODO: 임시로 임베딩 해둔거라, 나중에 임베딩 방법 더 좋은거 있으면 변경 필요함
  async function getEmbedding(openai: OpenAI, text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  }

  /**
   * Function Calling 도구 실행
   */
  async function executeToolCall(
    userId: string,
    toolName: string,
    args: Record<string, any>,
    openai: OpenAI
  ): Promise<string> {
    try {
      switch (toolName) {
        case 'search_notes': {
          const keyword = args.keyword as string;
          const limit = (args.limit as number) || 5;

          // 모든 노트를 가져와서 키워드로 필터링 (간단한 구현)
          const allNotes = await noteService.listNotes(userId, null);
          const filtered = allNotes
            .filter(
              (note) =>
                note.title.toLowerCase().includes(keyword.toLowerCase()) ||
                note.content.toLowerCase().includes(keyword.toLowerCase())
            )
            .slice(0, limit);

          if (filtered.length === 0) {
            return JSON.stringify({ message: '검색 결과가 없습니다.', notes: [] });
          }

          return JSON.stringify({
            message: `${filtered.length}개의 노트를 찾았습니다.`,
            notes: filtered.map((n) => ({
              id: n.id,
              title: n.title,
              preview: n.content.slice(0, 200) + (n.content.length > 200 ? '...' : ''),
              updatedAt: n.updatedAt,
            })),
          });
        }

        case 'get_recent_notes': {
          const limit = (args.limit as number) || 5;
          const notes = await noteService.listNotes(userId, null);
          const recent = notes
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .slice(0, limit);

          return JSON.stringify({
            message: `최근 ${recent.length}개의 노트입니다.`,
            notes: recent.map((n) => ({
              id: n.id,
              title: n.title,
              preview: n.content.slice(0, 200) + (n.content.length > 200 ? '...' : ''),
              updatedAt: n.updatedAt,
            })),
          });
        }

        case 'search_conversations': {
          const keyword = args.keyword as string;
          const limit = (args.limit as number) || 5;

          const queryVector = await getEmbedding(openai, keyword);
          const searchResults = await graphVectorService.searchNodes(userId, queryVector, limit);

          if (searchResults.length === 0) {
            return JSON.stringify({ message: '검색 결과가 없습니다.', conversations: [] });
          }

          return JSON.stringify({
            message: `${searchResults.length}개의 관련 대화/노드를 찾았습니다.`,
            conversations: searchResults.map((result) => ({
              id: result.id,
              title: result.payload?.title || result.payload?.label || '제목 없음',
              content: result.payload?.content?.slice(0, 200) || '',
              similarity: result.score,
              clusterId: result.payload?.clusterId,
            })),
          });
        }

        case 'get_recent_conversations': {
          const limit = (args.limit as number) || 5;
          const { items: conversations } = await conversationService.listConversations(
            userId,
            limit
          );

          return JSON.stringify({
            message: `최근 ${conversations.length}개의 대화입니다.`,
            conversations: conversations.map((c) => ({
              id: c.id,
              title: c.title,
              updatedAt: c.updatedAt,
            })),
          });
        }

        case 'get_graph_summary': {
          const stats = await graphEmbeddingService.getStats(userId);
          const snapshot = await graphEmbeddingService.getSnapshotForUser(userId);

          return JSON.stringify({
            message: '그래프 요약 정보입니다.',
            stats: {
              totalNodes: stats?.nodes ?? 0,
              totalEdges: stats?.edges ?? 0,
              totalClusters: stats?.clusters ?? 0,
            },
            clusters:
              snapshot?.clusters?.map((c) => ({
                id: c.id,
                name: c.name,
                nodeCount: snapshot?.nodes?.filter((n) => n.clusterId === c.id).length ?? 0,
              })) ?? [],
          });
        }

        case 'get_note_content': {
          const noteId = args.noteId as string;
          try {
            const note = await noteService.getNote(userId, noteId);
            return JSON.stringify({
              message: '노트 내용입니다.',
              note: {
                id: note.id,
                title: note.title,
                content: note.content,
                updatedAt: note.updatedAt,
              },
            });
          } catch {
            return JSON.stringify({ message: '노트를 찾을 수 없습니다.', note: null });
          }
        }

        case 'get_conversation_messages': {
          const conversationId = args.conversationId as string;
          const limit = (args.limit as number) || 20;

          try {
            const conv = await conversationService.getConversation(conversationId, userId);
            const messageDocs = await messageService.findDocsByConversationId(conversationId);
            const messages = messageDocs.slice(0, limit);

            return JSON.stringify({
              message: '대화 내용입니다.',
              conversation: {
                id: conv.id,
                title: conv.title,
                messages: messages.map((m: { role: string; content: string }) => ({
                  role: m.role,
                  content: m.content.slice(0, 500) + (m.content.length > 500 ? '...' : ''),
                })),
              },
            });
          } catch {
            return JSON.stringify({ message: '대화를 찾을 수 없습니다.', conversation: null });
          }
        }

        default:
          return JSON.stringify({ error: `Unknown tool: ${toolName}` });
      }
    } catch (error) {
      return JSON.stringify({ error: `도구 실행 중 오류가 발생했습니다: ${error}` });
    }
  }

  /**
   * 모드 자동 결정 + 스트리밍 응답
   * POST /v1/agent/chat/stream
   */
  router.post('/chat/stream', async (req, res) => {
    const { sendEvent } = setupSSE(res);

    const { userMessage, contextText, modeHint } = req.body as ChatStreamRequestBody;

    const trimmedUser = (userMessage || '').trim();
    const context = (contextText || '').trim();
    const hasContext = context.length > 0;

    if (!trimmedUser) {
      sendEvent('error', { message: '메시지를 입력해주세요.' });
      return res.end();
    }

    const userId = getUserIdFromRequest(req);
    const userApiKey = await userRepository.findApiKeyById(userId, 'openai');

    if (!userApiKey) {
      sendEvent('error', { message: 'no api key' });
      return res.end();
    }

    const openai = new OpenAI({ apiKey: userApiKey });

    try {
      sendEvent('status', {
        phase: 'analyzing',
        message: '요청 분석 중...',
      });

      const classifierSystemPrompt = `
      You are a router inside a note-taking and chat app.

      You must choose EXACTLY ONE of the following modes for the current request:

      - "chat"    : general conversation, Q&A, searching for notes/chats, asking about data, etc.
      - "summary" : the user is asking to summarize, 정리해줘, 요약, 핵심만, 한줄요약, 개요 etc.
      - "note"    : the user is asking to turn content into a note, 회의록, 기록, 노트로 정리, note, meeting minutes, minutes, 기록으로 남겨 etc.

      Rules:
      - If the user explicitly says anything like "노트로 정리해줘", "회의록으로 만들어줘",
        "note로 만들어줘", "meeting minutes로 만들어줘", "기록으로 남겨줘" → choose "note".
      - If the user explicitly asks for "요약", "정리해줘", "핵심만", "summary", "개요"
        → choose "summary" (UNLESS they clearly say "노트로 정리" which is "note").
      - If the user asks to find, search, or look up notes/conversations → choose "chat".
      - Greetings or small talk → choose "chat".
      - If you are unsure, default to "chat".

      Output format:
      - Respond with ONLY a JSON object in one line.
      - Example: {"mode":"chat","reason":"user wants to search notes"}
      `;

      const classifierUserMessage = `
      [User message]
      ${trimmedUser}

      [Has context?]
      ${hasContext ? 'yes' : 'no'}

      [Context preview]
      ${context.slice(0, 500)}
      `;

      const classifierResp = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: classifierSystemPrompt },
          { role: 'user', content: classifierUserMessage },
        ],
      });

      const classifierContent = classifierResp.choices[0]?.message?.content ?? '{"mode":"chat"}';

      let mode: Mode = 'chat';

      try {
        const parsed = JSON.parse(classifierContent) as { mode?: string; reason?: string };
        if (parsed.mode === 'chat' || parsed.mode === 'summary' || parsed.mode === 'note') {
          mode = parsed.mode;
        } else {
          mode = 'chat';
        }
      } catch {
        mode = 'chat';
      }

      if (modeHint === 'summary') mode = 'summary';
      if (modeHint === 'note') mode = 'note';

      sendEvent('status', {
        phase: 'analyzing',
        message: `요청 분석 완료 (mode = ${mode})`,
      });

      if (mode === 'chat') {
        const systemPrompt = `
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

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: hasContext ? `[Context]\n${context}\n\n[User]\n${trimmedUser}` : trimmedUser,
          },
        ];

        let continueLoop = true;
        let loopCount = 0;
        const maxLoops = 5;

        while (continueLoop && loopCount < maxLoops) {
          loopCount++;

          const response = await openai.chat.completions.create({
            model: 'gpt-4.1-mini',
            messages,
            tools: agentTools,
            tool_choice: 'auto',
          });

          const choice = response.choices[0];
          const assistantMessage = choice.message;

          if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
            messages.push(assistantMessage);

            sendEvent('status', {
              phase: 'searching',
              message: '데이터 검색 중...',
            });

            for (const toolCall of assistantMessage.tool_calls) {
              if (toolCall.type !== 'function') continue;

              const toolName = toolCall.function.name;
              const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

              const toolResult = await executeToolCall(userId, toolName, toolArgs, openai);

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
              mode: 'chat' as Mode,
              answer: finalContent,
              noteContent: null,
            });
          }
        }

        return res.end();
      }

      // ===== SUMMARY =====
      if (mode === 'summary') {
        const systemPrompt = `
        Summarize ONLY the given context.
        Do NOT create a structured note.
        Use a simple markdown bullet list ("- ...").
        `;

        const summaryResp = await openai.chat.completions.create({
          model: 'gpt-4.1-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `[User request]\n${trimmedUser}\n\n[Context]\n${context}`,
            },
          ],
        });

        const summary = summaryResp.choices[0]?.message?.content ?? '';

        sendEvent('chunk', { text: summary });
        sendEvent('status', { phase: 'done', message: '요약 생성 완료' });
        return res.end();
      }

      // ===== NOTE =====
      const systemPromptNote = `
      Create a well-structured markdown NOTE based on the user request and context.

      Formatting:
      - Use headings (##, ###) to group related ideas.
      - Use bullet lists (- ...) when helpful.
      - Use numbered lists when describing steps or processes.
      - Highlight key decisions, conclusions, and TODOs.
      - Output ONLY valid markdown. Do NOT add meta text like "Here is your note".
      `;

      const userForNote = `[User request]\n${trimmedUser}\n\n[Context]\n${context}`;

      const noteStream = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        stream: true,
        messages: [
          { role: 'system', content: systemPromptNote },
          { role: 'user', content: userForNote },
        ],
      });

      let fullNote = '';

      for await (const chunk of noteStream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (!delta) continue;
        fullNote += delta;
        sendEvent('chunk', { text: delta });
      }

      sendEvent('status', { phase: 'done', message: '노트 생성 완료' });
      sendEvent('result', {
        mode: 'note' as Mode,
        answer: fullNote,
        noteContent: fullNote,
      });
      return res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendEvent('status', { phase: 'error', message: '에러 발생' });
      sendEvent('error', { message });
      return res.end();
    }
  });

  return router;
}
