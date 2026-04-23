/**
 * 모듈: AI Provider 라우팅 레지스트리
 *
 * OpenAI 호환 모델(DeepSeek, Qwen 등) 추가 시:
 *   createOpenAICompatibleProvider({ baseURL: '...' }) 인스턴스를 providers 테이블에 등록하세요.
 */

import { openAiProvider, deepseekProvider } from './openai';
import { claudeProvider } from './claude';
import { geminiProvider } from './gemini';
import { ApiKeyModel } from '../dtos/me';
import { IAiProvider } from './IAiProvider';

const providers: Record<ApiKeyModel, IAiProvider> = {
  openai: openAiProvider,
  deepseek: deepseekProvider,
  claude: claudeProvider,
  gemini: geminiProvider,
};

/**
 * 모델 계열 식별자에 해당하는 IAiProvider 인스턴스를 반환합니다.
 * @param model 모델 계열 식별자
 * @returns IAiProvider 인스턴스
 * @throws Error 등록되지 않은 모델 계열
 */
export const getAiProvider = (model: ApiKeyModel): IAiProvider => {
  const provider = providers[model];
  if (!provider) throw new Error(`Provider for model ${model} not found`);
  return provider;
};

export { openAiProvider, deepseekProvider, claudeProvider, geminiProvider };
export * from './IAiProvider';
export * from './ChatMessageRequest';
