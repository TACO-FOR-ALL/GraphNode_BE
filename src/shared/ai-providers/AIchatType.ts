import { ApiKeyModel } from '../dtos/me';

/**
 * \model: AI 모델 (openai | deepseek)
 * \chatContent: AI 챗 대화 내용
 * @prop id FE가 만들어줄 message 용 uuid
 * @prop model AI 모델
 * @prop chatContent AI 챗 대화 내용
 * @prop modelName AI 모델 이름
 */
// FIXME: [Model Option Expansion]
// 현재는 'model' 필드가 'openai' | 'deepseek' 등의 Provider 의미로 사용되고 있습니다.
// 추후 Provider 하위의 구체적인 모델(e.g., gpt-4, gpt-3.5-turbo, claude-3-opus 등)을
// 선택할 수 있도록 옵션 구조를 확장해야 합니다. (예: provider: string, modelOption: string)
export interface AIchatType {
  id: string;
  model: ApiKeyModel;
  chatContent: string;
  modelName? : string;
}
