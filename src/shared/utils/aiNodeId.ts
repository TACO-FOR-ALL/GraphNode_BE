/**
 * AI 매크로 파이프라인이 여러 입력 소스를 병합할 때 붙이는 임시 source namespace 패턴입니다.
 *
 * 배경:
 * - 2026-04-11 기준 조사에서 AI 측 `merge_inputs()` 경로는 source 충돌 방지를 위해
 *   `src0_`, `src1_`, `src12_` 같은 prefix를 원본 ID 앞에 부여할 수 있음이 확인되었습니다.
 * - 이 prefix는 AI 내부 merge 단계에서는 유효하지만, BE의 영구 저장 식별자에는 불필요합니다.
 * - 따라서 BE에서는 이 패턴을 일관되게 감지해 제거할 수 있어야 합니다.
 *
 * 예시:
 * - `src0_conv-e2e-123`
 * - `src1_note-e2e-123`
 * - `src12_conv-incremental-1712820000000`
 */
const AI_SOURCE_PREFIX_PATTERN = /^src\d+_(.+)$/;

/**
 * AI가 반환한 원본 ID를 정규화한 결과를 담는 구조체입니다.
 *
 * 문제 상황:
 * - AI 결과의 `origId/orig_id`는 어떤 경우에는 실제 source ID 그대로 오고,
 *   어떤 경우에는 `src<number>_` prefix가 포함된 임시 namespace 형태로 올 수 있습니다.
 * - 저장 계층, dedup, 테스트 검증, 운영 로그가 모두 같은 기준을 써야 하므로
 *   "들어온 값(raw)"과 "저장에 쓸 값(normalized)"를 분리해 다룰 필요가 있습니다.
 *
 * 이 인터페이스를 두는 이유:
 * - 단순히 문자열 하나만 반환하면 로그에서 원본 입력을 잃어버립니다.
 * - prefix 제거가 실제로 발생했는지 여부까지 구조적으로 남겨야
 *   추후 runtime 로그와 DB 상태를 대조할 수 있습니다.
 *
 * @property rawOrigId AI 또는 상위 호출자가 전달한 가공 전 원본 ID
 *   - 예: `conv-e2e-123`
 *   - 예: `src0_conv-e2e-123`
 * @property normalizedOrigId Mongo `graph_nodes.origId` 및 내부 비교에 사용할 정규화된 ID
 *   - 예: `conv-e2e-123`
 * @property strippedSourcePrefix `src<number>_` prefix 제거가 실제로 발생했는지 여부
 *   - `true`이면 AI merge 단계의 임시 namespace가 제거되었음을 의미합니다.
 */
export interface NormalizedAiOrigId {
  rawOrigId: string;
  normalizedOrigId: string;
  strippedSourcePrefix: boolean;
}

/**
 * AI 결과의 `origId/orig_id`를 BE 저장 기준에 맞게 정규화합니다.
 *
 * 왜 필요한가:
 * - 2026-04-11 기준 재조사에서, AI 매크로 파이프라인은 내부 merge 단계에서
 *   `src0_conv-e2e-123` 같은 임시 namespace를 붙일 수 있음이 확인되었습니다.
 * - 하지만 BE는 Mongo `graph_nodes.origId`가 실제 conversation/note ID인
 *   `conv-e2e-123`, `note-e2e-123`로 저장되기를 기대합니다.
 * - 이 불일치를 handler마다 제각각 처리하면, 어떤 경로는 strip되고 어떤 경로는 안 되는
 *   비대칭 버그가 생기기 쉽습니다. 그래서 공용 유틸로 고정했습니다.
 *
 * 이 메서드가 해결하는 문제:
 * 1. GraphGeneration 저장 경로에서 AI 임시 namespace 제거
 * 2. AddNode dedup 시 기존 Mongo origId와의 비교 기준 통일
 * 3. edge resolve 전에 원본 ID를 동일 규칙으로 정규화
 * 4. 테스트와 운영 로그에서 raw 값과 저장 값을 동시에 추적 가능하게 함
 *
 * 내부 동작:
 * 1. 입력 문자열이 `^src\\d+_` 패턴에 매칭되는지 검사합니다.
 * 2. 매칭되면 prefix를 제거한 뒤 `normalizedOrigId`에 담습니다.
 * 3. 이 경우 `strippedSourcePrefix`를 `true`로 설정합니다.
 * 4. 매칭되지 않으면 입력값을 그대로 `normalizedOrigId`에 넣고 `false`를 반환합니다.
 *
 * 예시:
 * - 입력: `conv-e2e-123`
 *   반환: `{ rawOrigId: 'conv-e2e-123', normalizedOrigId: 'conv-e2e-123', strippedSourcePrefix: false }`
 * - 입력: `src0_conv-e2e-123`
 *   반환: `{ rawOrigId: 'src0_conv-e2e-123', normalizedOrigId: 'conv-e2e-123', strippedSourcePrefix: true }`
 * - 입력: `src12_note-incremental-999`
 *   반환: `{ rawOrigId: 'src12_note-incremental-999', normalizedOrigId: 'note-incremental-999', strippedSourcePrefix: true }`
 *
 * @param rawOrigId AI macro pipeline 또는 상위 로직이 전달한 원본 ID
 * @returns raw 값, normalized 값, prefix 제거 여부를 함께 담은 정규화 결과 객체
 */
export function normalizeAiOrigId(rawOrigId: string): NormalizedAiOrigId {
  const match = AI_SOURCE_PREFIX_PATTERN.exec(rawOrigId);
  if (!match) {
    return {
      rawOrigId,
      normalizedOrigId: rawOrigId,
      strippedSourcePrefix: false,
    };
  }

  return {
    rawOrigId,
    normalizedOrigId: match[1],
    strippedSourcePrefix: true,
  };
}

/**
 * AddNode AI 결과의 batch 전용 string ID에서 `{userId}_` prefix만 제거합니다.
 *
 * 문제 상황:
 * - AddNode의 edge/source/target은 Mongo numeric id가 아니라
 *   `{userId}_{origId}` 형식의 문자열로 올 수 있습니다.
 * - 예: `user-e2e-123_conv-e2e-123`
 * - 예: `user-e2e-123_src0_conv-e2e-123`
 * - 이 값은 바로 기존 Mongo `origId`와 비교할 수 없기 때문에,
 *   먼저 사용자 prefix를 제거한 뒤, 필요하면 `normalizeAiOrigId()`로 source prefix까지 제거해야 합니다.
 *
 * 왜 분리했는가:
 * - `{userId}_` 제거와 `src<number>_` 제거는 서로 다른 의미의 정규화입니다.
 * - 전자는 AddNode batch 식별자 해석 문제이고,
 *   후자는 AI merge namespace 제거 문제입니다.
 * - 두 단계를 별도 함수로 나누면 handler에서 어떤 정규화가 수행되는지 코드상 더 명확해집니다.
 *
 * 내부 동작:
 * 1. 현재 사용자 기준 prefix 문자열 `{userId}_`를 구성합니다.
 * 2. 입력값이 그 prefix로 시작하면 해당 부분만 제거합니다.
 * 3. 시작하지 않으면 원본 문자열을 그대로 반환합니다.
 *
 * 예시:
 * - `stripUserPrefix('user-e2e-123_conv-e2e-123', 'user-e2e-123')`
 *   -> `conv-e2e-123`
 * - `stripUserPrefix('user-e2e-123_src0_conv-e2e-123', 'user-e2e-123')`
 *   -> `src0_conv-e2e-123`
 * - `stripUserPrefix('42', 'user-e2e-123')`
 *   -> `42`
 *
 * @param rawId AI edge 또는 node 식별자 문자열
 * @param userId 현재 사용자 ID. `{userId}_` prefix 판별에 사용됩니다.
 * @returns user prefix가 제거된 문자열. prefix가 없으면 원본을 그대로 반환합니다.
 */
export function stripUserPrefix(rawId: string, userId: string): string {
  const prefix = `${userId}_`;
  return rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId;
}
