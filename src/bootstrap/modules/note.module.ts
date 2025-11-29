/**
 * 모듈: Note 컴포지션 (의존성 조립)
 * 
 * 책임:
 * - Note 관련 Repository와 Service 인스턴스를 생성하고 연결(Wiring)합니다.
 * - 최종적으로 Express Router를 생성하여 반환합니다.
 * - 의존성 주입(Dependency Injection)의 시작점 역할을 합니다.
 */

import { Router } from 'express';

import { NoteRepositoryMongo } from '../../infra/repositories/NoteRepositoryMongo';
import { NoteService } from '../../core/services/NoteService';
import { createNoteRouter } from '../../app/routes/note.routes';

/**
 * Note 라우터 생성 팩토리 함수
 * 
 * @returns 조립이 완료된 Express Router 객체
 */
export function makeNoteRouter(): Router {
  // 1. Repository 인스턴스 생성 (MongoDB 구현체)
  const noteRepo = new NoteRepositoryMongo();
  
  // 2. Service 인스턴스 생성 (Repository 주입)
  const noteService = new NoteService(noteRepo);

  // 3. Router 생성 (Service 주입) 및 반환
  return createNoteRouter({ noteService });
}
