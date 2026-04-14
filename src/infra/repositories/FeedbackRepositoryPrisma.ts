import prisma from '../db/prisma';
import { FeedbackRepository } from '../../core/ports/FeedbackRepository';
import { FeedbackRecord } from '../../core/types/persistence/feedback.persistence';

export class FeedbackRepositoryPrisma implements FeedbackRepository {
  /**
   * 사용자 피드백 데이터 저장
   * @param record
   * @returns
   */
  async create(): Promise<FeedbackRecord> {
    const feedback = await prisma.feedback.create({});

    return {
      id: feedback.id,
      category: feedback.category,
      userName: feedback.userName,
      userEmail: feedback.userEmail,
      title: feedback.title,
      content: feedback.content,
      status: feedback.status,
      createdAt: feedback.createdAt,
      updatedAt: feedback.updatedAt,
    };
  }
}
