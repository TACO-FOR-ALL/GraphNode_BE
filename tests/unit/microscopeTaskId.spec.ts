import { describe, it, expect } from '@jest/globals';
import { parseUserIdFromMicroscopeNodeTaskId } from '../../src/shared/utils/microscopeTaskId';

describe('parseUserIdFromMicroscopeNodeTaskId', () => {
  it('extracts userId from task_microscope_node_{userId}_{ulid}', () => {
    expect(
      parseUserIdFromMicroscopeNodeTaskId(
        'task_microscope_node_user-12345_01KSB1ZRG9WP64HKHWT79EFQH5'
      )
    ).toBe('user-12345');
  });

  it('returns undefined for unrelated task ids', () => {
    expect(parseUserIdFromMicroscopeNodeTaskId('task_user-12345_01KSB1ZRG9WP64HKHWT79EFQH5')).toBe(
      undefined
    );
  });
});
