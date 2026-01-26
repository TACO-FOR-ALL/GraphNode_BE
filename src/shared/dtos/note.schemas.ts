import { z } from 'zod';

/**
 * 모듈: 노트/폴더 관련 Zod 스키마
 * 책임: API 요청 데이터의 유효성 검증을 위한 스키마를 정의한다.
 */

/**
 * 노트 생성 요청 스키마
 */
export const createNoteSchema = z.object({
  /** 노트 ID (선택). 생략 시 서버 생성 */
  id: z.uuid().optional(),
  /** 노트 제목 (선택). 생략 시 내용의 첫 줄이나 기본값 사용 */
  title: z.string().min(1).optional(),
  /** 노트 내용 (필수). Markdown 형식 */
  content: z.string().min(1, 'Content is required'),
  /** 소속 폴더 ID (선택). 생략 또는 null 시 최상위 */
  folderId: z.string().nullable().optional(),
});

/**
 * 노트 수정 요청 스키마
 */
export const updateNoteSchema = z.object({
  /** 변경할 제목 (선택) */
  title: z.string().min(1).optional(),
  /** 변경할 내용 (선택) */
  content: z.string().min(1).optional(),
  /** 이동할 폴더 ID (선택). null로 설정 시 최상위로 이동 */
  folderId: z.string().nullable().optional(),
});

/**
 * 폴더 생성 요청 스키마
 */
export const createFolderSchema = z.object({
  /** 폴더 ID (선택). 생략 시 서버 생성 */
  id: z.uuid().optional(),
  /** 폴더 이름 (필수) */
  name: z.string().min(1, 'Folder name is required'),
  /** 상위 폴더 ID (선택). 생략 또는 null 시 최상위 */
  parentId: z.string().nullable().optional(),
});

/**
 * 폴더 수정 요청 스키마
 */
export const updateFolderSchema = z.object({
  /** 변경할 폴더 이름 (선택) */
  name: z.string().min(1).optional(),
  /** 이동할 상위 폴더 ID (선택). null로 설정 시 최상위로 이동 */
  parentId: z.string().nullable().optional(),
});

// --- Type Inference ---

/** 노트 생성 요청 타입 */
export type CreateNoteRequest = z.infer<typeof createNoteSchema>;

/** 노트 수정 요청 타입 */
export type UpdateNoteRequest = z.infer<typeof updateNoteSchema>;

/** 폴더 생성 요청 타입 */
export type CreateFolderRequest = z.infer<typeof createFolderSchema>;

/** 폴더 수정 요청 타입 */
export type UpdateFolderRequest = z.infer<typeof updateFolderSchema>;
