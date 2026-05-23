/**
 * @description `task_microscope_node_{userId}_{ulid}` 형식 taskId에서 userId를 추출합니다.
 * @param taskId SQS envelope taskId입니다.
 * @returns 추출된 userId 또는 파싱 불가 시 undefined입니다.
 * @example
 * parseUserIdFromMicroscopeNodeTaskId('task_microscope_node_user-12345_01KSB1ZRG9WP64HKHWT79EFQH5');
 * // => 'user-12345'
 */
export function parseUserIdFromMicroscopeNodeTaskId(taskId: string): string | undefined {
  const prefix = 'task_microscope_node_';
  if (!taskId.startsWith(prefix)) {
    return undefined;
  }

  const rest = taskId.slice(prefix.length);
  const ulidSuffix = rest.match(/_([0-9A-HJKMNP-TV-Z]{26})$/);
  if (!ulidSuffix) {
    return undefined;
  }

  const userId = rest.slice(0, rest.length - ulidSuffix[0].length);
  return userId.length > 0 ? userId : undefined;
}
