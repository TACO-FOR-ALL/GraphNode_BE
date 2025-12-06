import { Router } from 'express';
import OpenAI from 'openai';

const OPENAI_API_KEY = '';

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

export function createTestAgentRouter(): Router {
  const router = Router();

  router.post('/chat-to-note/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const { chatText, instruction } = req.body as {
      chatText: string;
      instruction?: string;
    };

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      sendEvent('status', {
        phase: 'analyzing',
        message: '채팅 내용 분석 중...',
      });

      const analysisResp = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: '아래 채팅에서 핵심 이슈/결정사항/To-Do만 bullet 리스트로 정리해줘.',
          },
          { role: 'user', content: chatText },
        ],
      });

      const analysis = analysisResp.choices[0]?.message?.content ?? '';
      sendEvent('partial', { kind: 'analysis', content: analysis });

      sendEvent('status', {
        phase: 'summarizing',
        message: '핵심 내용 정리 및 구조 설계 중...',
      });

      const outlineResp = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content:
              '회의록/노트의 목차를 설계하는 도우미이다. bullet 요약을 바탕으로 3~6개 섹션으로 구성된 목차를 제안해줘.',
          },
          {
            role: 'user',
            content: `bullet 요약:\n${analysis}`,
          },
        ],
      });

      const outline = outlineResp.choices[0]?.message?.content ?? '';
      sendEvent('partial', { kind: 'outline', content: outline });

      sendEvent('status', {
        phase: 'writing',
        message: '노트 내용 작성 중...',
      });

      const userInstruction =
        instruction ?? '회의록 형태의 노트를 작성해줘. 결론과 To-Do가 잘 드러나게 써줘.';

      const stream = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        stream: true,
        messages: [
          {
            role: 'system',
            content:
              '너는 마크다운 회의록을 작성하는 도우미이다. 반드시 마크다운만 출력하고, 불필요한 설명은 하지 않는다.',
          },
          {
            role: 'user',
            content: `
[작성 지시]
${userInstruction}

[bullet 요약]
${analysis}

[노트 목차]
${outline}
`,
          },
        ],
      });

      let fullNote = '';

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (!delta) continue;
        fullNote += delta;
        sendEvent('chunk', { text: delta });
      }

      sendEvent('status', {
        phase: 'done',
        message: '노트 생성 완료',
      });
      sendEvent('result', { noteContent: fullNote });

      res.end();
    } catch (err) {
      console.error(err);
      sendEvent('status', {
        phase: 'error',
        message: '에러 발생',
      });
      sendEvent('error', {
        message: (err as Error).message,
      });
      res.end();
    }
  });

  router.post('/answer-note/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const { instruction, currentContent, chatContext } = req.body as {
      instruction: string;
      currentContent?: string;
      chatContext?: string;
    };

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      sendEvent('status', {
        phase: 'analyzing',
        message: '노트/채팅 내용 분석 중...',
      });

      const systemPrompt = `
너는 개인 노트/채팅 앱의 AI 비서이다.
- 사용자가 보낸 노트 내용과 (있다면) 채팅 내용을 바탕으로 질문에 답한다.
- 가능한 한 제공된 텍스트에 근거해 답변하고, 모르면 모른다고 말한다.
`;

      const userMessage = `
[사용자 요청]
${instruction}

[현재 노트 내용]
${currentContent || '(없음)'}

[채팅 컨텍스트]
${chatContext || '(없음)'}
`;

      sendEvent('status', {
        phase: 'writing',
        message: '답변 작성 중...',
      });

      const stream = await openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });

      let fullAnswer = '';

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (!delta) continue;
        fullAnswer += delta;
        sendEvent('chunk', { text: delta });
      }

      sendEvent('status', {
        phase: 'done',
        message: '답변 생성 완료',
      });
      sendEvent('result', { answer: fullAnswer });

      res.end();
    } catch (err) {
      console.error(err);
      sendEvent('status', {
        phase: 'error',
        message: '에러 발생',
      });
      sendEvent('error', {
        message: (err as Error).message,
      });
      res.end();
    }
  });

  return router;
}
