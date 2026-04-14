import { RequestBuilder, type HttpResponse } from '../http-builder.js';
import type { CreateFeedbackRequestDto, CreateFeedbackResponseDto } from '../types/feedback.js';

export class FeedbackApi {
  constructor(private rb: RequestBuilder) {}

  /**
   *
   *  FIXME 주석 작성 필요, CRUD 전부 다 구현 필요
   *
   * @param body
   * @returns
   */
  create(body: CreateFeedbackRequestDto): Promise<HttpResponse<CreateFeedbackResponseDto>> {
    return this.rb.path('/v1/feedback').post<CreateFeedbackResponseDto>(body);
  }
}
