import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

import { createE2eS3Client } from './e2e-s3-client';

export { createE2eS3Client };

/**
 * @description Macro bundle 검증에 사용할 S3 payload 버킷 이름을 반환합니다.
 * @returns `S3_PAYLOAD_BUCKET` 또는 E2E compose 기본값.
 */
export function getE2ePayloadBucket(): string {
  return process.env.S3_PAYLOAD_BUCKET || 'taco5-graphnode-graphdata-s3';
}

/**
 * @description prefix 아래 S3 객체 키 목록을 반환합니다.
 * @param prefix 슬래시로 끝나는 S3 prefix (예: `graph-generation/task_.../`).
 * @returns 버킷 내 객체 키 배열.
 */
export async function listS3KeysUnderPrefix(prefix: string): Promise<string[]> {
  const client = createE2eS3Client();
  const bucket = getE2ePayloadBucket();
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    for (const item of res.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

export interface MacroBundleUserFileExpectation {
  /** Mongo `user_files._id` */
  id: string;
  /** bundle `files/{id}_{displayName}` 세그먼트에 사용되는 표시 이름 */
  displayName: string;
}

export interface MacroGraphBundleAssertionInput {
  /** `POST /v1/graph-ai/generate` 응답 taskId */
  taskId: string;
  /** bundle `files/`에 복사될 사용자 파일 목록 */
  userFiles: MacroBundleUserFileExpectation[];
}

/**
 * @description GraphNode_AI Macro prefix bundle(`graph-generation/{taskId}/`) S3 업로드를 검증합니다.
 * @param input taskId 및 기대 user file 목록.
 * @throws bundle 키 누락·prefix 형식 불일치 시 Error.
 */
export interface AddNodeBundleAssertionInput {
  /** `requestAddNodeViaQueue` taskId */
  taskId: string;
  userFiles: MacroBundleUserFileExpectation[];
}

/**
 * @description AddNode raw file bundle(`add-node/{taskId}/`) S3 업로드를 검증합니다.
 * @param input taskId 및 기대 user file 목록입니다.
 */
export async function assertAddNodeBundleUploaded(input: AddNodeBundleAssertionInput): Promise<void> {
  const prefix = `add-node/${input.taskId}/`;
  const keys = await listS3KeysUnderPrefix(prefix);

  if (keys.length === 0) {
    throw new Error(
      `AddNode bundle not found under s3://${getE2ePayloadBucket()}/${prefix} (is LocalStack reachable?)`
    );
  }

  const required = [
    `${prefix}batch.json`,
    ...input.userFiles.map((f) => `${prefix}files/${f.id}_${f.displayName}`),
  ];

  for (const key of required) {
    if (!keys.includes(key)) {
      throw new Error(
        `Missing AddNode S3 bundle object: ${key}. Found keys: ${JSON.stringify(keys.sort())}`
      );
    }
  }
}

export async function assertMacroGraphBundleUploaded(
  input: MacroGraphBundleAssertionInput
): Promise<void> {
  const prefix = `graph-generation/${input.taskId}/`;
  const keys = await listS3KeysUnderPrefix(prefix);

  if (keys.length === 0) {
    throw new Error(
      `Macro bundle not found under s3://${getE2ePayloadBucket()}/${prefix} (is LocalStack reachable?)`
    );
  }

  const required = [
    `${prefix}input.json`,
    `${prefix}notes.json`,
    ...input.userFiles.map((f) => `${prefix}files/${f.id}_${f.displayName}`),
  ];

  for (const key of required) {
    if (!keys.includes(key)) {
      throw new Error(
        `Missing S3 bundle object: ${key}. Found keys: ${JSON.stringify(keys.sort())}`
      );
    }
  }

  const client = createE2eS3Client();
  const inputObj = await client.send(
    new GetObjectCommand({
      Bucket: getE2ePayloadBucket(),
      Key: `${prefix}input.json`,
    })
  );
  const inputBody = await inputObj.Body?.transformToString('utf-8');
  if (!inputBody || inputBody.trim().length === 0) {
    throw new Error('Macro bundle input.json is empty');
  }
}
