/**
 * 모듈: Graph Editor 컴포지션(의존성 조립)
 * 작성일: 2026-05-01
 *
 * 책임: GraphEditorService 인스턴스를 조립하고 라우터를 생성해 반환합니다.
 */

import type { Router } from 'express';

import { createGraphEditorRouter } from '../../app/routes/GraphEditorRouter';
import { container } from '../container';

/**
 * Graph Editor 라우터 팩토리.
 * @returns /v1/graph/editor/* 를 처리하는 Express Router
 */
export function makeGraphEditorRouter(): Router {
  const editorService = container.getGraphEditorService();
  return createGraphEditorRouter(editorService);
}
