/**
 * 모듈: EmailPort (메일 발송 Port)
 *
 * 책임:
 * - Core(Service) 레이어가 SES/SMTP 등 구현체에 직접 의존하지 않도록 추상화합니다.
 */
export interface EmailPort {
  /**
   * @description 이메일을 첨부파일과 함께 발송합니다.
   * @param input.to 수신자 이메일 주소. 빈 문자열 금지.
   * @param input.subject 이메일 제목. 1–200자 권장.
   * @param input.text 본문(plain text).
   * @param input.attachmentFilename 첨부파일명. 예: `conversation.json`
   * @param input.attachmentContentType 첨부 MIME 타입. 예: `application/json; charset=utf-8`
   * @param input.attachmentBuffer 첨부파일 바이트 버퍼.
   */
  sendEmailWithAttachment(input: {
    to: string;
    subject: string;
    text: string;
    attachmentFilename: string;
    attachmentContentType: string;
    attachmentBuffer: Buffer;
  }): Promise<void>;
}
