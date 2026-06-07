import type { GraphNodeDto, GraphSnapshotDto, GraphSourceType } from '../../shared/dtos/graph';

const GRAPH_SOURCE_VALUES = new Set<string>(['chat', 'markdown', 'notion', 'file']);

/**
 * 파일 노드의 확장자·포맷 라벨을 얻습니다(BE 요약 집계용).
 *
 * @param meta 그래프 노드 메타데이터입니다.
 * @returns 집계 버킷 키(예: `pdf`, `docx`).
 */
function extensionBucketForFileNode(meta?: Record<string, unknown>): string {
  const raw = meta?.['ai_raw_source_type'];
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim().toLowerCase();
  }

  const mf = meta?.['macroFileType'];
  if (mf === 'pdf') return 'pdf';
  if (mf === 'word') return 'docx';
  if (mf === 'powerpoint') return 'pptx';
  if (mf === 'spreadsheet') return 'xlsx';
  if (mf === 'text') return 'txt';

  return 'other';
}

/**
 * GraphSnapshotDto에서 sourceType별 노드 개수를 집계합니다.
 *
 * @param snapshot GraphSnapshotDto입니다.
 * @returns 대화·노트·노션·파일 개수 및 파일 포맷별 개수입니다.
 */
export function countSourceTypesFromSnapshot(snapshot: GraphSnapshotDto): {
  chatCount: number;
  noteCount: number;
  notionCount: number;
  fileCount: number;
  fileCountsByExtension: Record<string, number>;
} {
  let chatCount = 0;
  let noteCount = 0;
  let notionCount = 0;
  let fileCount = 0;
  const fileCountsByExtension: Record<string, number> = {};

  for (const node of snapshot.nodes) {
    if (node.sourceType === 'chat') {
      chatCount++;
    } else if (node.sourceType === 'markdown') {
      noteCount++;
    } else if (node.sourceType === 'notion') {
      notionCount++;
    } else if (node.sourceType === 'file') {
      fileCount++;
      const bucket = extensionBucketForFileNode(node.metadata as Record<string, unknown> | undefined);
      fileCountsByExtension[bucket] = (fileCountsByExtension[bucket] ?? 0) + 1;
    }
  }

  return { chatCount, noteCount, notionCount, fileCount, fileCountsByExtension };
}

/**
 * GraphNodeDto 목록에서 sourceType별 노드 개수를 집계합니다.
 *
 * @param nodeList GraphNodeDto 배열입니다.
 * @returns 대화·노트·노션·파일 개수 및 파일 포맷별 개수입니다.
 */
export function countSourceTypesFromNodeList(nodeList: GraphNodeDto[]): {
  chatCount: number;
  noteCount: number;
  notionCount: number;
  fileCount: number;
  fileCountsByExtension: Record<string, number>;
} {
  let chatCount = 0;
  let noteCount = 0;
  let notionCount = 0;
  let fileCount = 0;
  const fileCountsByExtension: Record<string, number> = {};

  for (const node of nodeList) {
    const st = node.sourceType as GraphSourceType | string | undefined;
    if (st === 'chat') {
      chatCount++;
    } else if (st === 'markdown') {
      noteCount++;
    } else if (st === 'notion') {
      notionCount++;
    } else if (st === 'file') {
      fileCount++;
      const bucket = extensionBucketForFileNode(node.metadata as Record<string, unknown> | undefined);
      fileCountsByExtension[bucket] = (fileCountsByExtension[bucket] ?? 0) + 1;
    } else if (typeof st === 'string' && st.length > 0 && !GRAPH_SOURCE_VALUES.has(st)) {
      fileCount++;
      const bucket = st.toLowerCase();
      fileCountsByExtension[bucket] = (fileCountsByExtension[bucket] ?? 0) + 1;
    }
  }

  return { chatCount, noteCount, notionCount, fileCount, fileCountsByExtension };
}
