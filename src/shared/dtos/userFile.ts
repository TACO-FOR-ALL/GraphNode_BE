/**
 * 모듈: 사용자 라이브러리 파일 API용 DTO
 *
 * 책임:
 * - FE·SDK와 서버 간 사용자 파일 메타데이터 및 사이드바 병합 목록 계약을 정의한다.
 */
import type { UserFileCategory } from '../config/fileUploadSpec';

/** AI 요약 파이프라인 상태 (API 응답용 문자열) */
export type UserFileSummaryStatusDto = 'pending' | 'processing' | 'completed' | 'failed';

/** 단일 사용자 파일 응답 본문 */
export interface UserFileDto {
  /** Mongo `user_files._id` */
  id: string;
  /** 소속 폴더 ID (없으면 루트) */
  folderId: string | null;
  /** 동일 폴더 내 충돌 시 `이름(1).ext` 형태로 조정된 표시명 */
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  category: UserFileCategory;
  /** AI 요약 본문 (완료 후) */
  summary?: string;
  summaryStatus: UserFileSummaryStatusDto;
  summaryError?: string | null;
  /** 요약 큐 발행 시 correlation용 task 식별자 */
  aiTaskId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 사이드바 병합 행의 종류 */
export type SidebarItemKind = 'note' | 'file';

/** 노트 한 건 또는 파일 한 건을 동일한 목록 행으로 표현 */
export interface SidebarItemDto {
  kind: SidebarItemKind;
  id: string;
  /** 노트 제목 또는 파일 `displayName` */
  title: string;
  folderId: string | null;
  updatedAt: string;
}

/** `GET /v1/sidebar-items` 응답 */
export interface SidebarItemsResponseDto {
  items: SidebarItemDto[];
}
