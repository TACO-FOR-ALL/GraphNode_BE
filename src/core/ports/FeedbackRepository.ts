import { FeedbackRecord } from '../types/persistence/feedback.persistence';

export interface FeedbackRepository {
  create(record: FeedbackRecord): Promise<FeedbackRecord>;

  // FIXME CRUD 전체 다 만들어야 함
}
