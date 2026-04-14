/**
 * 사용자 피드백 데이터 구조 정의 파일
 */

/**
 * 사용자 피드백 데이터 구조
 * @param id 피드백 구분용 id
 * @param category 피드백 Category
 * @param userName 사용지 이름()
 * @param userEmail 사용자 이메일()
 * @param title 피드백 제목
 * @param content 피드백 내용
 * @param status 피드백 확인 여부(확인 전, 확인함, 진행 중, 진행 완료 등)
 * @param createdAt 생성시각
 * @param updatedAt 업데이트 시각
 */
export interface FeedbackRecord {
  id: string;
  category: string;
  userName: string | null;
  userEmail: string | null;
  title: string;
  content: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}
