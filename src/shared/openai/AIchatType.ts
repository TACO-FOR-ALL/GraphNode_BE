import { ApiKeyModel } from '../dtos/me';

/**
 * \model: AI 모델 (openai | deepseek)
 * \chatContent: AI 챗 대화 내용
 * @prop model AI 모델
 * @prop chatContent AI 챗 대화 내용
 */
export interface AIchatType {
    model: ApiKeyModel;
    chatContent: string;
}