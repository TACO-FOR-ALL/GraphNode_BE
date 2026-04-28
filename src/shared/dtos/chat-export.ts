export type ChatExportStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
export interface StartChatExportRequestDto {
  conversationId: string;
}
export interface StartChatExportResponseDto {
  jobId: string;
  status: ChatExportStatus;
}
export interface ChatExportStatusResponseDto {
  jobId: string;
  status: ChatExportStatus;
  downloadUrl?: string;
  errorMessage?: string;
}