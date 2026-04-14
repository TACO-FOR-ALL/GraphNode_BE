export const DEFAULT_FEEDBACK_STATUS = 'UNREAD';

/**
 *
 */
export interface CreateFeedbackRequestDto {
  category: string;
  userName?: string | null;
  userEmail?: string | null;
  title: string;
  content: string;
}

/**
 * Feedback ㄱ데이터 Dto
 */
export interface FeedbackDto {
  id: string;
  category: string;
  userName: string | null;
  userEmail: string | null;
  title: string;
  content: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 *
 */
export interface CreateFeedbackResponseDto {
  feedback: FeedbackDto;
}
