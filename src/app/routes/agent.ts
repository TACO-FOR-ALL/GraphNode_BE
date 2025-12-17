import express, { Router } from 'express';
import OpenAI from 'openai';

import { bindSessionUser } from '../middlewares/session';
import { requireLogin } from '../middlewares/auth';
import type { UserRepositoryMySQL } from '../../infra/repositories/UserRepositoryMySQL';

type Mode = 'chat' | 'summary' | 'note';
type ModeHint = 'summary' | 'note' | 'auto';

type ChatStreamRequestBody = {
  userMessage: string;
  contextText?: string;
  modeHint?: ModeHint;
};

/**
 * /v1/agent 라우터를 생성하는 팩토리 함수.
 * - 구조는 `me.ts`와 동일하게 Router 팩토리 함수 형태를 따른다.
 * - 기능은 기존 `agent.test.ts`의 /chat/stream SSE 로직만 사용한다.
 */
export function createAgentRouter(userRepository: UserRepositoryMySQL): Router {
  const router = Router();

  router.use(bindSessionUser);
  router.use(requireLogin);

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

    const userId = Number(req.session.userId!);
    const userApiKey = await userRepository.findApiKeyById(userId, 'openai');

    if (!userApiKey) {
      sendEvent('error', { message: 'no api key' });
      return res.end();
    }

    const openai = new OpenAI({
      apiKey: userApiKey,
    });

    try {
      sendEvent('status', {
        phase: 'analyzing',
        message: '요청 분석 중 (mode 결정)...',
      });

      const classifierSystemPrompt = `
You are a router inside a note-taking and chat app.

You must choose EXACTLY ONE of the following modes for the current request:

- "chat"    : general conversation, Q&A, small talk, brainstorming, etc.
- "summary" : the user is asking to summarize, 정리해줘, 요약, 핵심만, 한줄요약, 개요 etc.
- "note"    : the user is asking to turn content into a note, 회의록, 기록, 노트로 정리, note, meeting minutes, minutes, 기록으로 남겨 etc.

Rules:
- If the user explicitly says anything like "노트로 정리해줘", "회의록으로 만들어줘", 
  "note로 만들어줘", "meeting minutes로 만들어줘", "기록으로 남겨줘" → choose "note".
- If the user explicitly asks for "요약", "정리해줘", "핵심만", "summary", "개요" 
  → choose "summary" (UNLESS they clearly say "노트로 정리" which is "note").
- Greetings or small talk (like "안녕", "잘 지내?", "어때?") with NO explicit mention of 
  note/summary → choose "chat".
- If you are unsure, default to "chat".

Output format:
- Respond with ONLY a JSON object in one line.
- Example: {"mode":"chat","reason":"small talk greeting only"}
- Allowed values for mode: "chat", "summary", "note".
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
        const parsed = JSON.parse(classifierContent) as {
          mode?: string;
          reason?: string;
        };

        if (parsed.mode === 'chat' || parsed.mode === 'summary' || parsed.mode === 'note') {
          mode = parsed.mode;
        } else {
          mode = 'chat';
        }
      } catch {
        mode = 'chat';
      }

      // modeHint가 명시되면 우선 적용
      if (modeHint === 'summary') mode = 'summary';
      if (modeHint === 'note') mode = 'note';

      sendEvent('status', {
        phase: 'analyzing',
        message: `요청 분석 완료 (mode = ${mode})`,
      });

      // ===== CHAT =====
      if (mode === 'chat') {
        const systemPrompt = `
You are the "GraphNode AI Assistant".
Just chat naturally with the user.
NEVER produce long, structured notes or meeting minutes here.
`;

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: hasContext ? `[Context]\n${context}\n\n[User]\n${trimmedUser}` : trimmedUser,
          },
        ];

        const stream = await openai.chat.completions.create({
          model: 'gpt-4.1-mini',
          stream: true,
          messages,
        });

        let fullAnswer = '';

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? '';
          if (!delta) continue;
          fullAnswer += delta;
          sendEvent('chunk', { text: delta });
        }

        sendEvent('status', { phase: 'done', message: '응답 생성 완료' });
        sendEvent('result', {
          mode: 'chat' as Mode,
          answer: fullAnswer,
          noteContent: null,
        });
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
