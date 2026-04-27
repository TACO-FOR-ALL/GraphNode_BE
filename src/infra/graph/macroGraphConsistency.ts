/**
 * @description Macro Graph shadow read 비교에서 발견된 단일 필드 차이를 표현합니다.
 *
 * MongoDB primary와 Neo4j secondary의 DTO를 동일한 기준으로 정규화한 뒤, 실제 값이 달라진
 * 경로와 양쪽 값을 함께 보존합니다. Discord/Sentry 알림은 이 구조를 그대로 사용하므로,
 * 운영 중 어떤 필드가 migration parity를 깨뜨렸는지 추적할 수 있습니다.
 *
 * @property path JSON path 형식의 비교 위치입니다. 예: `$.nodes[0].id`
 * @property primary MongoDB primary에서 조회한 정규화 값입니다.
 * @property secondary Neo4j secondary에서 조회한 정규화 값입니다.
 * @property reason 타입 불일치, 배열 길이 불일치, 숫자 오차 초과 등 차이가 발생한 이유입니다.
 */
export interface MacroGraphDiffEntry {
  path: string;
  primary: unknown;
  secondary: unknown;
  reason: string;
}

/**
 * @description Macro Graph shadow read 비교의 최종 결과입니다.
 *
 * 프록시는 `matched`가 false일 때만 로그/Discord/Sentry 알림을 발생시킵니다. `diffs`는 최대
 * `MAX_DIFFS`까지만 수집하여 알림 폭주와 payload 과대화를 막습니다.
 *
 * @property matched 두 저장소의 정규화 결과가 동일하면 true입니다.
 * @property diffs 불일치 세부 내역입니다. 동일한 경우 빈 배열입니다.
 */
export interface MacroGraphCompareResult {
  matched: boolean;
  diffs: MacroGraphDiffEntry[];
}

type CompareMode = 'single' | 'collection';

/**
 * @description GraphDocumentStore read method별 정합성 비교 방식을 정의합니다.
 *
 * 필드 단위 제외/추가가 필요한 경우 이 규칙만 수정하면 됩니다. 테스트의 비교 기준과 동일하게
 * timestamp성 필드나 Neo4j에서 관계로 복원되는 파생 필드는 선택적으로 제외할 수 있습니다.
 *
 * @property mode 단일 객체 비교인지, id 기준 collection 비교인지 나타냅니다.
 * @property fields 비교 대상 필드 allow-list입니다. undefined이면 정규화된 전체 값을 비교합니다.
 * @property projector 특수 DTO를 비교 가능한 shape으로 축약하는 함수입니다.
 */
interface CompareRule {
  mode: CompareMode;
  fields?: readonly string[];
  projector?: (value: unknown) => unknown;
}

const NUMBER_TOLERANCE = 1e-9;
const MAX_DIFFS = 25;

const NODE_FIELDS = [
  'id',
  'userId',
  'origId',
  'clusterId',
  'clusterName',
  'numMessages',
  'sourceType',
  'deletedAt',
] as const;

const EDGE_FIELDS = [
  'id',
  'userId',
  'source',
  'target',
  'weight',
  'type',
  'intraCluster',
  'deletedAt',
] as const;

const CLUSTER_FIELDS = [
  'id',
  'userId',
  'name',
  'description',
  'size',
  'themes',
  'deletedAt',
] as const;

const SUBCLUSTER_FIELDS = [
  'id',
  'userId',
  'clusterId',
  'nodeIds',
  'representativeNodeId',
  'size',
  'density',
  'topKeywords',
  'deletedAt',
] as const;

const STATS_FIELDS = ['userId', 'nodes', 'edges', 'clusters', 'status'] as const;

const METHOD_RULES: Record<string, CompareRule> = {
  findNode: { mode: 'single', fields: NODE_FIELDS },
  findNodesByOrigIds: { mode: 'collection', fields: NODE_FIELDS },
  findNodesByOrigIdsAll: { mode: 'collection', fields: NODE_FIELDS },
  listNodes: { mode: 'collection', fields: NODE_FIELDS },
  listNodesAll: { mode: 'collection', fields: NODE_FIELDS },
  listNodesByCluster: { mode: 'collection', fields: NODE_FIELDS },

  listEdges: { mode: 'collection', fields: EDGE_FIELDS },

  findCluster: { mode: 'single', fields: CLUSTER_FIELDS },
  listClusters: { mode: 'collection', fields: CLUSTER_FIELDS },

  listSubclusters: { mode: 'collection', fields: SUBCLUSTER_FIELDS },

  getStats: { mode: 'single', fields: STATS_FIELDS },

  getGraphSummary: {
    mode: 'single',
    projector: (value) => {
      const obj = isRecord(value) ? value : {};
      const overview = isRecord(obj.overview) ? obj.overview : {};
      const clusters = Array.isArray(obj.clusters) ? obj.clusters : [];
      return {
        userId: obj.userId,
        total_conversations: overview.total_conversations,
        total_notes: overview.total_notes,
        total_notions: overview.total_notions,
        clusterCount: clusters.length,
        detail_level: obj.detail_level,
        deletedAt: obj.deletedAt,
      };
    },
  },
};

/**
 * @description MongoDB primary read 결과와 Neo4j secondary shadow read 결과를 migration parity 기준으로 비교합니다.
 *
 * 이 함수는 통합 테스트 `macro-consistency.spec.ts`의 비교 원칙을 운영 코드에서 재사용하기 위한 모듈화된
 * 진입점입니다. Neo4j Integer(Long)는 JS number로 변환하고, 부동소수점은 `1e-9` 오차를 허용하며,
 * collection은 반환 순서 차이를 제거한 뒤 비교합니다.
 *
 * @param method 호출된 GraphDocumentStore read method 이름입니다. method별 allow-list/projector 선택에 사용합니다.
 * @param primary MongoDB primary에서 반환된 DTO 또는 DTO 배열입니다.
 * @param secondary Neo4j secondary에서 반환된 DTO 또는 DTO 배열입니다.
 * @param maxDiffs Discord/Sentry payload가 과도하게 커지지 않도록 수집할 최대 diff 개수입니다.
 * @returns 두 결과의 일치 여부와 상세 diff 배열입니다.
 * @throws 비교 과정에서 예외를 의도적으로 던지지 않습니다. 알 수 없는 구조는 `unknown` 값으로 보수적으로 비교합니다.
 */
export function compareMacroGraphResults(
  method: string,
  primary: unknown,
  secondary: unknown,
  maxDiffs = MAX_DIFFS
): MacroGraphCompareResult {
  // method별 규칙이 있으면 해당 필드만 비교하고, 없으면 값의 형태에 따라 보수적인 기본 비교를 수행합니다.
  const rule = METHOD_RULES[method] ?? { mode: Array.isArray(primary) ? 'collection' : 'single' };
  const primaryProjected = projectForCompare(primary, rule);
  const secondaryProjected = projectForCompare(secondary, rule);
  const diffs: MacroGraphDiffEntry[] = [];

  collectDiffs(primaryProjected, secondaryProjected, '$', diffs, maxDiffs);
  return { matched: diffs.length === 0, diffs };
}

function projectForCompare(value: unknown, rule: CompareRule): unknown {
  if (rule.projector) return normalizeValue(rule.projector(value));

  if (rule.mode === 'collection') {
    // Mongo/Neo4j의 반환 순서 차이는 migration parity와 무관하므로 id/origId 기준으로 정렬 후 비교합니다.
    const arr = Array.isArray(value) ? value : [];
    return arr.map((item) => pickFields(item, rule.fields)).sort(compareCollectionItem);
  }

  return pickFields(value, rule.fields);
}

function pickFields(value: unknown, fields?: readonly string[]): unknown {
  const normalized = normalizeValue(value);
  if (!fields || !isRecord(normalized)) return normalized;

  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in normalized) {
      picked[field] = normalizeValue(normalized[field]);
    }
  }
  return picked;
}

function normalizeValue(value: unknown): unknown {
  if (isNeo4jInteger(value)) {
    // Neo4j Integer(Long)는 DTO 기준의 JS number로 변환하여 기존 integration test 기준과 맞춥니다.
    return value.toNumber();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue).sort(compareStableJson);
  }

  if (isRecord(value)) {
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      // 저장소별 자동 timestamp 차이는 migration 정합성 판단에서 제외합니다.
      if (key === 'createdAt' || key === 'updatedAt' || key === 'generatedAt') continue;
      normalized[key] = normalizeValue(value[key]);
    }
    return normalized;
  }

  return value;
}

function collectDiffs(
  primary: unknown,
  secondary: unknown,
  path: string,
  diffs: MacroGraphDiffEntry[],
  maxDiffs: number
): void {
  if (diffs.length >= maxDiffs) return;
  if (Object.is(primary, secondary)) return;

  if (primary == null || secondary == null) {
    if (primary !== secondary) {
      diffs.push({ path, primary, secondary, reason: 'null/undefined mismatch' });
    }
    return;
  }

  const primaryType = Array.isArray(primary) ? 'array' : typeof primary;
  const secondaryType = Array.isArray(secondary) ? 'array' : typeof secondary;
  if (primaryType !== secondaryType) {
    diffs.push({
      path,
      primary: compactDiffValue(primary),
      secondary: compactDiffValue(secondary),
      reason: `type mismatch: ${primaryType} vs ${secondaryType}`,
    });
    return;
  }

  if (Array.isArray(primary) && Array.isArray(secondary)) {
    if (primary.length !== secondary.length) {
      diffs.push({
        path: `${path}.length`,
        primary: primary.length,
        secondary: secondary.length,
        reason: 'array length mismatch',
      });
      if (diffs.length >= maxDiffs) return;
    }

    const maxLength = Math.min(Math.max(primary.length, secondary.length), 50);
    for (let i = 0; i < maxLength; i += 1) {
      collectDiffs(primary[i], secondary[i], `${path}[${i}]`, diffs, maxDiffs);
      if (diffs.length >= maxDiffs) return;
    }
    return;
  }

  if (isRecord(primary) && isRecord(secondary)) {
    const keys = Array.from(new Set([...Object.keys(primary), ...Object.keys(secondary)])).sort();
    for (const key of keys) {
      collectDiffs(primary[key], secondary[key], `${path}.${key}`, diffs, maxDiffs);
      if (diffs.length >= maxDiffs) return;
    }
    return;
  }

  if (typeof primary === 'number' && typeof secondary === 'number') {
    // embedding/weight/density 등 부동소수점 필드는 기존 consistency spec과 같은 미세 오차를 허용합니다.
    if (Math.abs(primary - secondary) > NUMBER_TOLERANCE) {
      diffs.push({ path, primary, secondary, reason: 'number value mismatch' });
    }
    return;
  }

  if (primary !== secondary) {
    diffs.push({ path, primary, secondary, reason: 'value mismatch' });
  }
}

/**
 * @description 불일치 diff 배열로부터 알림 중복 제거용 signature를 생성합니다.
 *
 * 같은 사용자와 같은 read method에서 동일 필드가 반복적으로 어긋나는 경우 Discord/Sentry 알림이 폭주하지
 * 않도록 상위 diff 일부만 안정 문자열로 축약합니다.
 *
 * @param method 호출된 read method 이름입니다.
 * @param diffs `compareMacroGraphResults`가 반환한 diff 배열입니다.
 * @returns dedupe map의 key 일부로 사용할 수 있는 안정 문자열입니다.
 * @throws 문자열 변환만 수행하므로 예외를 의도적으로 던지지 않습니다.
 */
export function buildMacroGraphDiffSignature(
  method: string,
  diffs: readonly MacroGraphDiffEntry[]
): string {
  // 동일 mismatch의 반복 알림을 억제하기 위해 method와 상위 diff 몇 개로 안정적인 signature를 만듭니다.
  return [
    method,
    ...diffs
      .slice(0, 5)
      .map(
        (diff) => `${diff.path}:${diff.reason}:${String(diff.primary)}:${String(diff.secondary)}`
      ),
  ].join('|');
}

function compactDiffValue(value: unknown): unknown {
  if (Array.isArray(value)) return `[array:${value.length}]`;
  if (!isRecord(value)) return value;
  return {
    id: value.id,
    origId: value.origId,
    userId: value.userId,
    deletedAt: value.deletedAt,
  };
}

function compareStableJson(a: unknown, b: unknown): number {
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}

function compareCollectionItem(a: unknown, b: unknown): number {
  const aId = getComparableId(a);
  const bId = getComparableId(b);
  if (aId != null && bId != null) return String(aId).localeCompare(String(bId));
  return compareStableJson(a, b);
}

function getComparableId(value: unknown): string | number | undefined {
  if (!isRecord(value)) return undefined;
  const id = value.id ?? value.origId ?? value.userId;
  return typeof id === 'string' || typeof id === 'number' ? id : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNeo4jInteger(value: unknown): value is { toNumber(): number } {
  return isRecord(value) && typeof value.toNumber === 'function';
}
