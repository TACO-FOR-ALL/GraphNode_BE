import { ApiKeyModel } from '../dtos/me';

/**
 * \model: AI 모델 (openai | deepseek)
 * \chatContent: AI 챗 대화 내용
 * @prop id FE가 만들어줄 message 용 uuid
 * @prop model AI 모델
 * @prop chatContent AI 챗 대화 내용
 */
export interface AIchatType {
  id: string;
  model: ApiKeyModel;
  chatContent: string;
}
