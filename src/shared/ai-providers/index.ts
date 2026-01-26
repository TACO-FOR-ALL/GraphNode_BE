import { openAI } from './openai'; // 기존 openai.ts (내부 구조는 IAiProvider에 맞게 수정 필요할 수 있음)
import { claudeProvider } from './claude';
import { geminiProvider } from './gemini';
import { ApiKeyModel } from '../dtos/me'; // DTO 위치 확인 필요
import { IAiProvider } from './IAiProvider';

// OpenAI Provider의 인터페이스 호환성 확인 필요.
// 기존 openAI 객체가 IAiProvider와 정확히 일치하지 않을 수 있으므로(메서드명 등), 래퍼를 쓰거나 기존 파일을 수정해야 함.
// 여기서는 export 할 때 매핑합니다.

const providers: Record<ApiKeyModel, IAiProvider> = {
  openai: openAI as unknown as IAiProvider, // TODO: openAI 구현체를 IAiProvider에 맞게 수정 권장
  deepseek: openAI as unknown as IAiProvider, // DeepSeek uses OpenAI-compatible API
  claude: claudeProvider,
  gemini: geminiProvider,
};

export const getAiProvider = (model: ApiKeyModel): IAiProvider => {
  const provider = providers[model];
  if (!provider) {
    throw new Error(`Provider for model ${model} not found`);
  }
  return provider;
};

export { openAI, claudeProvider, geminiProvider };
export * from './IAiProvider';
export * from './ChatMessageRequest';
