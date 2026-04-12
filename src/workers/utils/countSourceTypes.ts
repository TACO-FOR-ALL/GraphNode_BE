import { GraphNodeDto, GraphSnapshotDto } from '../../shared/dtos/graph';

/**
 * GraphSnapshotDto에서, sourceType이 conversation, note, notion인 것의 개수를 각각 골라내는 메서드
 * @param shanshot GraphSnapshotDto
 * @returns
 */
export function countSourceTypesFromSnapshot(snapshot: GraphSnapshotDto): {
  chatCount: number;
  noteCount: number;
  notionCount: number;
} {
  let chatCount = 0;
  let noteCount = 0;
  let notionCount = 0;

  for (const node of snapshot.nodes) {
    if (node.sourceType === 'chat') {
      chatCount++;
    } else if (node.sourceType === 'markdown') {
      noteCount++;
    } else if (node.sourceType === 'notion') {
      notionCount++;
    }
  }

  return { chatCount, noteCount, notionCount };
}

/**
 * GraphNodeDto List에서, sourceType이 conversation, note, notion인 것의 개수를 각각 골라내는 메서드
 * @param nodeList GraphNodeDto List
 * @returns {chatCount: number, noteCount: number, notionCount: number}
 */
export function countSourceTypesFromNodeList(nodeList: GraphNodeDto[]): {
  chatCount: number;
  noteCount: number;
  notionCount: number;
} {
  let chatCount = 0;
  let noteCount = 0;
  let notionCount = 0;

  for (const node of nodeList) {
    if (node.sourceType === 'chat') {
      chatCount++;
    } else if (node.sourceType === 'markdown') {
      noteCount++;
    } else if (node.sourceType === 'notion') {
      notionCount++;
    }
  }

  return { chatCount, noteCount, notionCount };
}
