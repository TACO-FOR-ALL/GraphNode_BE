import type { ScopeFilter } from './graph.js';

/**
 * Graph AI 생성 작업 응답 DTO입니다.
 *
 * @public
 * @property message 서버가 반환한 작업 접수 메시지입니다.
 * @property taskId 백그라운드 그래프 생성 작업 ID입니다. `status`가 `skipped`인 경우 없을 수 있습니다.
 * @property status 작업 상태입니다. 일반적으로 `queued` 또는 `skipped`입니다.
 */
export interface GraphGenerationResponseDto {
  message: string;
  taskId?: string;
  status: string;
}

/**
 * `client.graphAi.generateGraph()` 요청 옵션입니다.
 *
 * `scopeFilter`가 없으면 서버는 기존 1:1 그래프 모드로 동작하며 `macroId`가 없을 때
 * 현재 사용자 ID를 그래프 ID로 사용합니다. `scopeFilter`가 있으면 서버가 새 `macroId`를
 * 발급하고 필터링된 데이터 번들을 기반으로 1:N 그래프 생성을 큐에 넣습니다.
 *
 * @public
 * @property includeSummary 그래프 생성 후 요약 생성도 이어서 요청할지 여부입니다.
 * @property macroId 기존 1:1 또는 특정 그래프에 생성 작업을 연결할 때 사용하는 선택 값입니다.
 * @property scopeFilter 1:N 그래프 생성 범위입니다. 제공 시 새 1:N 그래프 생성 모드로 동작합니다.
 * @property title 1:N 그래프 메타데이터 제목입니다. `scopeFilter`와 함께 사용할 때 저장됩니다.
 * @property description 1:N 그래프 메타데이터 설명입니다. `scopeFilter`와 함께 사용할 때 저장됩니다.
 *
 * @example
 * ```ts
 * // 기존 1:1 그래프 생성
 * const legacy = await client.graphAi.generateGraph({ includeSummary: true });
 * ```
 *
 * @example
 * ```ts
 * // 1:N 그래프 생성
 * const scoped = await client.graphAi.generateGraph({
 *   title: '최근 프로젝트 자료 그래프',
 *   description: '최근 3개월 채팅과 파일만 포함한 작업용 그래프',
 *   scopeFilter: {
 *     mode: 'manual',
 *     filters: {
 *       dataTypes: ['chat', 'file'],
 *       createdPeriod: '3m'
 *     }
 *   }
 * });
 * ```
 */
export interface GenerateGraphOptions {
  includeSummary?: boolean;
  macroId?: string;
  scopeFilter?: ScopeFilter;
  title?: string;
  description?: string;
}
