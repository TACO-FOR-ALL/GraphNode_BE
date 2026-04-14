export interface CreateFeedbackRequestDto {
  category: string;
  userName?: string | null;
  userEmail?: string | null;
  title: string;
  content: string;
}

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

export interface CreateFeedbackResponseDto {
  feedback: FeedbackDto;
}
