import { Readable } from 'stream';
import { ulid } from 'ulid';

import { ChatManagementService } from './ChatManagementService';
import { GraphEmbeddingService } from './GraphEmbeddingService';
import { NoteService } from './NoteService';
import { UserService } from './UserService';
import { NotificationService } from './NotificationService';
import { HttpClient } from '../../infra/http/httpClient';
import {
  AiAddNodeBatchRequest,
  AiInputConversation,
  AiInputMappingNode,
  AiInputNote,
  AiInputSection,
  AiInputSourceNode,
} from '../../shared/dtos/ai_input';
import { logger } from '../../shared/utils/logger';
import { AppError, UpstreamError, GraphNotFoundError } from '../../shared/errors/domain';
import { ChatMessage } from '../../shared/dtos/ai';
import { mapSnapshotToAiInput } from '../../shared/mappers/graph_ai_input.mapper';
import {
  GraphGenRequestPayload,
  GraphSummaryRequestPayload,
  AddNodeRequestPayload,
  TaskType,
} from '../../shared/dtos/queue';
// Interfaces
import { QueuePort } from '../ports/QueuePort';
import { StoragePort } from '../ports/StoragePort';
import { loadEnv } from '../../config/env';
import { withRetry } from '../../shared/utils/retry';
import { GraphClusterDto } from '../../shared/dtos/graph';

/**
 * 모듈: GraphGenerationService
 * 책임:
 * - 지식 그래프 생성 및 요약 작업을 위한 Orchestration을 담당합니다.
 * - 사용자의 대화 데이터 및 노트(Markdown) 데이터를 수집하여 S3에 업로드합니다.
 * - SQS를 통해 AI Worker에게 그래프 생성/요약/추가 노드 작업을 요청합니다.
 * - 작업 상태(CREATING, UPDATING 등)를 관리하고 알림을 전송합니다.
 */
const AI_SERVER_URI = process.env.AI_SERVER_URI || 'https://aaejmqgtjczzbxcq.tunnel.elice.io';

export class GraphGenerationService {
  private readonly httpClient: HttpClient;
  private readonly jobQueueUrl: string;

  constructor(
    private readonly chatManagementService: ChatManagementService,
    private readonly graphEmbeddingService: GraphEmbeddingService,
    private readonly noteService: NoteService,
    private readonly userService: UserService,
    private readonly queuePort: QueuePort,
    private readonly storagePort: StoragePort,
    private readonly notificationService: NotificationService
  ) {
    const env = loadEnv();
    // FIXME TODO : HTTP Client 사용하지 않고 SQS로만 통신하도록 변경 예정
    this.httpClient = new HttpClient('GraphAI', {
      baseURL: AI_SERVER_URI,
      timeout: 300000,
    });
    this.jobQueueUrl = process.env.SQS_REQUEST_QUEUE_URL || 'TO_BE_CONFIGURED';
  }

  /**
   * SQS 기반 그래프 생성 요청
   * 사용자의 대화 및 노트 데이터를 S3에 업로드하고 작업 요청을 보냅니다.
   *
   * @param userId 사용자 ID
   * @param options 옵션 (요약 포함 여부 등)
   * @returns 발행된 작업의 Task ID 또는 건너뛴 경우 null
   */
  async requestGraphGenerationViaQueue(
    userId: string,
    options?: {
      includeSummary?: boolean;
    }
  ): Promise<string | null> {
    let taskId: string | undefined;
    try {
      // 0. 데이터 존재 여부 확인
      const convs = await withRetry(
        async () => await this.chatManagementService.listConversations(userId, 1),
        { label: 'ChatManagementService.listConversations.check' }
      );
      const notes = await withRetry(
        async () => await this.noteService.findNotesModifiedSince(userId, new Date(0)),
        { label: 'NoteService.findNotesModifiedSince.check' }
      );
      const activeNotes = notes.filter((n) => !n.deletedAt);

      if (convs.items.length === 0 && activeNotes.length === 0) {
        logger.info({ userId }, 'No conversation or note data found. Skipping graph generation.');
        return null;
      }

      taskId = `task_${userId}_${ulid()}`;
      const s3Key = `graph-generation/${taskId}/input.json`;

      // 상태 변경: CREATING
      await withRetry(
        async () =>
          await this.graphEmbeddingService.saveStats({
            userId,
            nodes: 0,
            edges: 0,
            clusters: 0,
            status: 'CREATING',
            generatedAt: new Date().toISOString(),
          }),
        { label: 'GraphEmbeddingService.saveStats' }
      );

      // 1. 대화 데이터 S3 업로드
      const dataStream = Readable.from(this.streamUserData(userId));
      await withRetry(
        async () => await this.storagePort.upload(s3Key, dataStream, 'application/json'),
        { label: 'Storage.upload.input' }
      );

      // 2. 노트 데이터 S3 업로드
      const noteS3Key = `graph-generation/${taskId}/notes.json`;
      const noteStream = Readable.from(this.streamNotes(userId));
      await withRetry(
        async () => await this.storagePort.upload(noteS3Key, noteStream, 'application/json'),
        { label: 'Storage.upload.notes' }
      );

      // 3. 사용자 언어 조회
      const language = await withRetry(
        async () => await this.userService.getPreferredLanguage(userId),
        { label: 'UserService.getPreferredLanguage' }
      );

      // 4. SQS 메시지 전송
      const messageBody: GraphGenRequestPayload = {
        taskId,
        taskType: TaskType.GRAPH_GENERATION_REQUEST,
        payload: {
          userId,
          s3Key,
          bucket: process.env.S3_PAYLOAD_BUCKET,
          includeSummary: options?.includeSummary ?? true,
          summaryLanguage: language,
          language: language,
          extraS3Keys: [noteS3Key], // 통합된 노트 데이터 S3 키 전달
        },
        timestamp: new Date().toISOString(),
      };

      await withRetry(async () => await this.queuePort.sendMessage(this.jobQueueUrl, messageBody), {
        label: 'QueuePort.sendMessage.GraphGen',
      });

      // 성공 알림 전송
      await this.notificationService.sendGraphGenerationRequested(userId, taskId);

      return taskId;
    } catch (err) {
      logger.error({ err, userId }, 'Failed to enqueue graph generation request');
      // 실패 알림 전송
      await this.notificationService.sendGraphGenerationRequestFailed(
        userId,
        taskId || 'unknown',
        String(err)
      );

      if (err instanceof AppError) throw err;
      throw new UpstreamError('Failed to request graph generation via queue', {
        cause: String(err),
      });
    }
  }

  /**
   * 로컬/클라우드 테스트를 위해 실제 DB 연동 없이 mock 데이터로 SQS(Add Node) 플로우만 트리거합니다.
   */
  async testRequestAddNodeViaQueue(userId: string): Promise<string> {
    const taskId = `task_test_add_node_${userId}_${ulid()}`;
    const s3Key = `add-node/${taskId}/test-batch.json`;

    const mockPayload = {
      userId,
      existingClusters: [],
      conversations: [
        {
          id: 'test_conv_id',
          conversation_id: 'test_conv_id',
          title: 'Test Mock Conversation',
          create_time: Date.now() / 1000,
          update_time: Date.now() / 1000,
          mapping: {
            test_msg_id: {
              id: 'test_msg_id',
              message: {
                id: 'test_msg_id',
                author: { role: 'user' },
                content: {
                  content_type: 'text',
                  parts: ['This is a test message for graph generation.'],
                },
              },
              parent: null,
              children: [],
            },
          },
        },
      ],
    };

    await this.storagePort.upload(s3Key, JSON.stringify(mockPayload), 'application/json');

    const messageBody: AddNodeRequestPayload = {
      taskId,
      taskType: TaskType.ADD_NODE_REQUEST,
      payload: {
        userId,
        s3Key,
        bucket: process.env.S3_PAYLOAD_BUCKET,
      },
      timestamp: new Date().toISOString(),
    };

    await this.queuePort.sendMessage(this.jobQueueUrl, messageBody);
    return taskId;
  }

  /**
   * SQS 기반 그래프 요약 요청
   *
   * @param userId 사용자 ID
   * @returns 발행된 작업의 Task ID
   */
  async requestGraphSummary(userId: string): Promise<string> {
    try {
      const taskId = `summary_${userId}_${ulid()}`;
      const snapshot = await withRetry(
        async () => await this.graphEmbeddingService.getSnapshotForUser(userId),
        { label: 'GraphEmbeddingService.getSnapshotForUser' }
      );
      if (!snapshot || snapshot.nodes.length === 0) {
        throw new GraphNotFoundError('Graph data not found for user. Please generate graph first.');
      }

      const language = await this.userService.getPreferredLanguage(userId);
      const aiInput = mapSnapshotToAiInput(snapshot, language);
      const jsonPayload = JSON.stringify(aiInput);
      const dataStream = Readable.from([jsonPayload]);

      const s3Key = `graph-summary/${taskId}/graph.json`;
      const bucket = process.env.S3_PAYLOAD_BUCKET || 'graph-node-payloads';

      await withRetry(
        async () => await this.storagePort.upload(s3Key, dataStream, 'application/json'),
        { label: 'Storage.upload.summary' }
      );

      const messageBody: GraphSummaryRequestPayload = {
        taskId,
        taskType: TaskType.GRAPH_SUMMARY_REQUEST,
        payload: {
          userId,
          graphS3Key: s3Key,
          bucket: bucket,
          language: language,
        },
        timestamp: new Date().toISOString(),
      };

      await withRetry(async () => await this.queuePort.sendMessage(this.jobQueueUrl, messageBody), {
        label: 'QueuePort.sendMessage.Summary',
      });

      // 성공 알림 전송
      await this.notificationService.sendGraphSummaryRequested(userId, taskId);

      return taskId;
    } catch (err) {
      logger.error({ err, userId }, 'Failed to requesting graph summary');

      // 실패 알림 전송
      const taskId = (err as any).taskId || 'unknown'; // taskId가 스코프 밖에 있을 수 있으므로 방어적 처리
      await this.notificationService.sendGraphSummaryRequestFailed(userId, taskId, String(err));

      if (err instanceof AppError) throw err;
      throw new UpstreamError('Request Graph Summary Failed', { cause: String(err) });
    }
  }

  /**
   * 요약 조회
   */
  async getGraphSummary(userId: string) {
    return this.graphEmbeddingService.getGraphSummary(userId);
  }

  /**
   * 요약 삭제
   */
  async deleteGraphSummary(userId: string, permanent?: boolean) {
    return this.graphEmbeddingService.deleteGraphSummary(userId, true);
  }

  /**
   * 요약 복원 (미지원)
   */
  async restoreGraphSummary(_userId: string) {
    throw new UpstreamError('Restore is not supported in hard-delete only mode');
  }

  /**
   * 그래프 삭제
   */
  async deleteGraph(userId: string, _permanent?: boolean) {
    return this.graphEmbeddingService.deleteGraph(userId, true);
  }

  /**
   * 그래프 복원 (미지원)
   */
  async restoreGraph(userId: string) {
    throw new UpstreamError('Restore is not supported in hard-delete only mode');
  }

  /**
   * SQS 기반 노드 추가 요청 (AddNode)
   *
   * @param userId 사용자 ID
   * @returns Task ID 또는 추가할 내용이 없는 경우 null
   */
  async requestAddNodeViaQueue(userId: string): Promise<string | null> {
    try {
      const taskId = `task_add_node_${userId}_${ulid()}`;
      const s3Key = `add-node/${taskId}/batch.json`;

      const stats = await withRetry(async () => await this.graphEmbeddingService.getStats(userId), {
        label: 'GraphEmbeddingService.getStats',
      });
      if (!stats) {
        throw new GraphNotFoundError('Graph statistics not found. Please generate graph first.');
      }

      const lastGraphUpdatedAt = stats.updatedAt ? new Date(stats.updatedAt).getTime() : 0;

      // 변경된 대화 수집
      const listResult = await withRetry(
        async () => await this.chatManagementService.listConversations(userId, 100),
        { label: 'ChatManagementService.listConversations.initial' }
      );
      let allConversations = listResult.items;

      let cursor = listResult.nextCursor ?? undefined;
      while (cursor !== null && cursor !== undefined) {
        const nextResult = await withRetry(
          async () => await this.chatManagementService.listConversations(userId, 100, cursor),
          { label: 'ChatManagementService.listConversations.loop' }
        );
        allConversations = allConversations.concat(nextResult.items);
        cursor = nextResult.nextCursor ?? undefined;
      }

      const updatedConversations = allConversations.filter((conv) => {
        const convUpdateTime = conv.updatedAt ? new Date(conv.updatedAt).getTime() : 0;
        return convUpdateTime > lastGraphUpdatedAt;
      });

      // 변경된 노트 수집 (lastGraphUpdatedAt 이후 수정된 활성 노트)
      const modifiedNotes = await withRetry(
        async () =>
          await this.noteService.findNotesModifiedSince(userId, new Date(lastGraphUpdatedAt)),
        { label: 'NoteService.findNotesModifiedSince' }
      );
      const updatedNotes = modifiedNotes.filter((note) => !note.deletedAt);

      // 대화도 노트도 변경 없으면 작업 불필요
      if (updatedConversations.length === 0 && updatedNotes.length === 0) {
        return null;
      }

      // AI 입력 포맷 변환
      const mappedConversations: AiInputConversation[] = updatedConversations.map((conv) => {
        const messages: ChatMessage[] = conv.messages || [];
        const mapping: Record<string, AiInputMappingNode> = {};
        let prevMsgId: string | null = null;

        // 대화 순서 정렬
        messages.sort((a, b) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeA - timeB;
        });

        // 대화 메시지 매핑
        for (const msg of messages) {
          const id = msg.id;
          mapping[id] = {
            id,
            message: {
              id,
              author: { role: msg.role },
              content: { content_type: 'text', parts: [msg.content] },
            },
            parent: prevMsgId,
            children: [],
          };

          if (prevMsgId && mapping[prevMsgId]) {
            mapping[prevMsgId].children.push(id);
          }
          prevMsgId = id;
        }

        return {
          id: conv.id,
          conversation_id: conv.id,
          conversationId: conv.id,
          title: conv.title,
          create_time: conv.createdAt ? new Date(conv.createdAt).getTime() / 1000 : 0,
          update_time: conv.updatedAt ? new Date(conv.updatedAt).getTime() / 1000 : 0,
          mapping,
        };
      });

      // 노트 AI 입력 포맷 변환 (AI가 요구하는 필드만 포함)
      const mappedNotes: AiInputNote[] = updatedNotes.map((note) => ({
        noteId: note._id,
        title: note.title,
        content: note.content,
      }));

      // 기존 클러스터 정보 가져오기
      const existingClusters: GraphClusterDto[] =
        await this.graphEmbeddingService.listClusters(userId);
      const batchPayload: AiAddNodeBatchRequest = {
        userId,
        existingClusters,
        conversations: mappedConversations,
        notes: mappedNotes,
      };

      // S3에 데이터 업로드
      const payloadJson: string = JSON.stringify(batchPayload);
      await this.storagePort.upload(s3Key, payloadJson, 'application/json');

      // 그래프 상태 업데이트
      stats.status = 'UPDATING';
      await this.graphEmbeddingService.saveStats(stats);

      // SQS 메시지 생성
      const messageBody: AddNodeRequestPayload = {
        taskId,
        taskType: TaskType.ADD_NODE_REQUEST,
        payload: {
          userId,
          s3Key,
          bucket: process.env.S3_PAYLOAD_BUCKET,
        },
        timestamp: new Date().toISOString(),
      };

      await withRetry(async () => await this.queuePort.sendMessage(this.jobQueueUrl, messageBody), {
        label: 'QueuePort.sendMessage.AddNode',
      });

      // 성공 알림 전송
      await this.notificationService.sendAddConversationRequested(userId, taskId);

      return taskId;
    } catch (err) {
      logger.error({ err, userId }, 'Failed to queue add node request');

      // 실패 알림 전송 (taskId가 try 블록 내부에 정의되어 있으므로 에러 객체에 taskId를 담아두거나 스코프를 조정해야 함)
      // 여기서는 스코프 문제로 'unknown' 처리하거나 상단으로 taskId 정의를 뺌
      await this.notificationService.sendAddConversationRequestFailed(
        userId,
        'unknown',
        String(err)
      );

      if (err instanceof AppError) throw err;
      throw new UpstreamError('Failed to request add node via queue', { cause: String(err) });
    }
  }

  /**
   * 사용자 대화 데이터를 AI 입력 형식으로 변환하여 스트리밍하는 제너레이터
   *
   * @param userId 사용자 ID
   * @yields 개별 대화 데이터 (JSON string)
   */
  private async *streamUserData(userId: string): AsyncGenerator<string> {
    yield '[';
    let isFirst = true;
    let cursor: string | undefined;
    const BATCH_SIZE = 50;

    while (true) {
      const result = await withRetry(
        async () => await this.chatManagementService.listConversations(userId, BATCH_SIZE, cursor),
        { label: 'ChatManagementService.listConversations.stream' }
      );

      for (const conv of result.items) {
        const messages: ChatMessage[] = conv.messages || [];
        const mapping: Record<string, AiInputMappingNode> = {};
        let prevMsgId: string | null = null;

        messages.sort((a, b) => {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tA - tB;
        });

        for (const msg of messages) {
          const id = msg.id;
          mapping[id] = {
            id,
            message: {
              id,
              author: { role: msg.role },
              content: { content_type: 'text', parts: [msg.content] },
            },
            parent: prevMsgId,
            children: [],
          };
          if (prevMsgId && mapping[prevMsgId]) {
            mapping[prevMsgId].children.push(id);
          }
          prevMsgId = id;
        }

        const aiItem: AiInputConversation = {
          id: conv.id,
          conversation_id: conv.id,
          conversationId: conv.id,
          title: conv.title,
          create_time: conv.createdAt ? new Date(conv.createdAt).getTime() / 1000 : 0,
          update_time: conv.updatedAt ? new Date(conv.updatedAt).getTime() / 1000 : 0,
          mapping,
        };

        if (!isFirst) yield ',';
        yield JSON.stringify(aiItem);
        isFirst = false;
      }

      if (!result.nextCursor) break;
      cursor = result.nextCursor ?? undefined;
    }
    yield ']';
  }

  /**
   * 사용자 노트 데이터를 AI 입력 형식으로 변환하여 스트리밍하는 제너레이터
   *
   * @param userId 사용자 ID
   * @yields 개별 노트 데이터 (JSON string)
   */
  private async *streamNotes(userId: string): AsyncGenerator<string> {
    yield '{"source_nodes":[';
    let isFirst = true;

    // NoteService.findNotesModifiedSince 를 활용하여 모든 노트를 가져옴
    const allNotes = await withRetry(
      async () => await this.noteService.findNotesModifiedSince(userId, new Date(0)),
      { label: 'NoteService.findNotesModifiedSince' }
    );

    for (const note of allNotes) {
      // 삭제된 노트 제외
      if (note.deletedAt) continue;

      const aiNote: AiInputSourceNode = {
        id: note._id,
        title: note.title,
        sections: [
          {
            id: note._id,
            content: note.content,
          },
        ],
        source_type: 'markdown',
        create_time: note.createdAt ? new Date(note.createdAt).getTime() / 1000 : 0,
        update_time: note.updatedAt ? new Date(note.updatedAt).getTime() / 1000 : 0,
      };

      if (!isFirst) yield ',';
      yield JSON.stringify(aiNote);
      isFirst = false;
    }

    yield ']}';
  }
}
