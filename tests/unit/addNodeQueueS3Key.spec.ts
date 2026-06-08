import { describe, it, expect } from '@jest/globals';

import { resolveAddNodeQueueS3Key } from '../../src/shared/utils/addNodeQueueS3Key';

describe('resolveAddNodeQueueS3Key', () => {
  const prefix = 'add-node/task_abc/';
  const batchKey = 'add-node/task_abc/batch.json';

  it('uses batch.json key for conversation/note-only AddNode (GraphNode_AI main legacy)', () => {
    expect(resolveAddNodeQueueS3Key(prefix, batchKey, false)).toBe(batchKey);
  });

  it('uses prefix bundle key when user_files are included', () => {
    expect(resolveAddNodeQueueS3Key(prefix, batchKey, true)).toBe(prefix);
  });
});
