import { ulid } from 'ulid';

import type { MacroGraphStore } from '../ports/MacroGraphStore';
import type { QueuePort } from '../ports/QueuePort';
import type { StoragePort } from '../ports/StoragePort';
import type { ConversationRepository } from '../ports/ConversationRepository';
import type { NoteRepository } from '../ports/NoteRepository';
import type { UserFileRepository } from '../ports/UserFileRepository';
import type { NotionCacheRepository } from '../ports/NotionCacheRepository';
import type {
  CreateMacroViewDto,
  ListMacroViewsQuery,
  MacroViewDto,
  ScopeFilter,
  UpdateMacroViewDto,
} from '../../shared/dtos/macro';
import { TaskType } from '../../shared/dtos/queue';
import type { MacroGraphAutoRequestPayload } from '../../shared/dtos/queue';
import { ValidationError, NotFoundError } from '../../shared/errors/domain';
import { logger } from '../../shared/utils/logger';
import { loadEnv } from '../../config/env';

/** 데이터 기간 필터를 절대 시각(Date)으로 변환합니다. */
function resolveSinceDateFromPeriod(period?: string): Date {
  const now = Date.now();
  const DAY_MS = 86_400_000;
  switch (period) {
    case '1w': return new Date(now - 7 * DAY_MS);
    case '1m': return new Date(now - 30 * DAY_MS);
    case '3m': return new Date(now - 90 * DAY_MS);
    case '1y': return new Date(now - 365 * DAY_MS);
    default:   return new Date(0); // 전체 기간
  }
}

/**
 * @description 매크로 뷰 생명주기를 관리하는 Core Service입니다.
 *
 * AUTO 모드: 전체 데이터 ID를 S3에 업로드 후 AI에게 자율 선택 위임.
 * MANUAL 모드: 사용자 필터 조건(dataTypes, createdPeriod)에 맞는 ID만 S3에 업로드 후 AI 처리.
 * taskId === macroId 패턴을 사용하여 AI 측 SQS 계약 수정 없이 macroId를 전달합니다.
 */
export class MacroViewService {
  private readonly requestQueueUrl: string;
  private readonly s3Bucket: string;

  constructor(
    private readonly macroGraphStore: MacroGraphStore,
    private readonly queuePort: QueuePort,
    private readonly storagePort: StoragePort,
    private readonly conversationRepo: ConversationRepository,
    private readonly noteRepo: NoteRepository,
    private readonly userFileRepo: UserFileRepository,
    private readonly notionCacheRepo: NotionCacheRepository
  ) {
    const env = loadEnv();
    this.requestQueueUrl = env.SQS_REQUEST_QUEUE_URL;
    this.s3Bucket = env.S3_PAYLOAD_BUCKET;
  }

  /**
   * @description 사용자의 매크로 뷰 목록을 조회합니다.
   *
   * @param userId 조회 대상 사용자 ID
   * @param query 정렬·필터 옵션
   * @returns 매크로 뷰 메타데이터 목록
   * @throws {ValidationError} userId가 비어 있는 경우
   */
  async listMacroViews(userId: string, query?: ListMacroViewsQuery): Promise<MacroViewDto[]> {
    if (!userId) throw new ValidationError('userId is required');
    return this.macroGraphStore.listMacroViews(userId, query);
  }

  /**
   * @description 단일 매크로 뷰 메타데이터를 조회합니다.
   *
   * @param userId 소유 사용자 ID
   * @param macroId 조회할 매크로 뷰 ID
   * @returns 매크로 뷰 메타데이터. 없으면 null.
   * @throws {ValidationError} userId 또는 macroId가 비어 있는 경우
   */
  async getMacroView(userId: string, macroId: string): Promise<MacroViewDto | null> {
    if (!userId || !macroId) throw new ValidationError('userId and macroId are required');
    return this.macroGraphStore.getMacroView(userId, macroId);
  }

  /**
   * @description 새 매크로 뷰를 생성하고 AI 파이프라인을 비동기로 트리거합니다.
   *
   * 1. ULID로 macroId 생성 → Neo4j MacroGraph 루트 노드 생성
   * 2. 스코프 조건에 따라 데이터 ID 목록 수집 → S3 업로드
   * 3. MACRO_GRAPH_AUTO_REQUEST SQS 메시지 전송 (taskId === macroId)
   *
   * @param userId 소유 사용자 ID
   * @param dto 생성 요청 데이터
   * @returns 생성된 매크로 뷰 메타데이터
   * @throws {ValidationError} userId가 비어 있거나 scopeFilter가 없는 경우
   */
  async createMacroView(userId: string, dto: CreateMacroViewDto): Promise<MacroViewDto> {
    if (!userId) throw new ValidationError('userId is required');
    if (!dto.scopeFilter) throw new ValidationError('scopeFilter is required');
    this.validateScopeFilter(dto.scopeFilter);

    const macroId = ulid();

    const view = await this.macroGraphStore.createMacroView(userId, macroId, {
      title: dto.title,
      description: dto.description,
      scopeFilter: dto.scopeFilter,
    });

    const dataIds = await this.collectDataIds(userId, dto.scopeFilter);
    const s3Key = `macro-auto/${macroId}/data_ids.json`;
    await this.storagePort.uploadJson(s3Key, dataIds);

    const message: MacroGraphAutoRequestPayload = {
      taskId: macroId,
      timestamp: new Date().toISOString(),
      taskType: TaskType.MACRO_GRAPH_AUTO_REQUEST,
      payload: {
        userId,
        macroId,
        scopeFilter: dto.scopeFilter,
        dataIdsS3Key: s3Key,
        bucket: this.s3Bucket,
      },
    };

    await this.queuePort.sendMessage(this.requestQueueUrl, message);

    logger.info({ userId, macroId, mode: dto.scopeFilter.mode }, 'MacroView created and AI pipeline triggered');

    return view;
  }

  /**
   * @description 매크로 뷰 메타데이터를 부분 업데이트합니다.
   *
   * @param userId 소유 사용자 ID
   * @param macroId 업데이트할 매크로 뷰 ID
   * @param patch 업데이트할 필드 부분 객체
   * @returns 업데이트된 매크로 뷰 메타데이터
   * @throws {ValidationError} userId 또는 macroId가 비어 있는 경우
   * @throws {NotFoundError} 해당 macroId의 뷰가 없는 경우
   */
  async updateMacroView(
    userId: string,
    macroId: string,
    patch: UpdateMacroViewDto
  ): Promise<MacroViewDto> {
    if (!userId || !macroId) throw new ValidationError('userId and macroId are required');
    if (patch.scopeFilter) this.validateScopeFilter(patch.scopeFilter);
    return this.macroGraphStore.updateMacroView(userId, macroId, patch);
  }

  /**
   * @description 기존 매크로 뷰를 복제하여 새 뷰를 생성합니다. scopeJson만 복사하며 레이아웃은 제외됩니다.
   *
   * @param userId 소유 사용자 ID
   * @param sourceMacroId 원본 매크로 뷰 ID
   * @returns 생성된 복제 뷰 메타데이터
   * @throws {ValidationError} userId 또는 sourceMacroId가 비어 있는 경우
   * @throws {NotFoundError} 원본 매크로 뷰가 없는 경우
   */
  async cloneMacroView(userId: string, sourceMacroId: string): Promise<MacroViewDto> {
    if (!userId || !sourceMacroId) throw new ValidationError('userId and sourceMacroId are required');

    const source = await this.macroGraphStore.getMacroView(userId, sourceMacroId);
    if (!source) throw new NotFoundError(`MacroView not found: ${sourceMacroId}`);

    const newMacroId = ulid();

    await this.macroGraphStore.createMacroView(userId, newMacroId, {
      title: source.title ? `[복사본] ${source.title}` : undefined,
      description: source.description,
      scopeFilter: source.scopeFilter ?? { mode: 'manual', filters: { dataTypes: [] } },
    });

    await this.macroGraphStore.cloneMacroGraph(userId, sourceMacroId, newMacroId);

    const cloned = await this.macroGraphStore.getMacroView(userId, newMacroId);
    return cloned!;
  }

  /**
   * @description 매크로 뷰를 Soft Delete합니다.
   *
   * @param userId 소유 사용자 ID
   * @param macroId 삭제할 매크로 뷰 ID
   * @throws {ValidationError} userId 또는 macroId가 비어 있는 경우
   * @throws {NotFoundError} 해당 macroId의 뷰가 없는 경우
   */
  async softDeleteMacroView(userId: string, macroId: string): Promise<void> {
    if (!userId || !macroId) throw new ValidationError('userId and macroId are required');
    await this.macroGraphStore.softDeleteMacroView(userId, macroId);
  }

  /**
   * @description Soft Delete된 매크로 뷰를 복원합니다.
   *
   * @param userId 소유 사용자 ID
   * @param macroId 복원할 매크로 뷰 ID
   * @throws {ValidationError} userId 또는 macroId가 비어 있는 경우
   * @throws {NotFoundError} 해당 macroId의 뷰가 없는 경우
   */
  async restoreMacroView(userId: string, macroId: string): Promise<void> {
    if (!userId || !macroId) throw new ValidationError('userId and macroId are required');
    await this.macroGraphStore.restoreMacroView(userId, macroId);
  }

  private validateScopeFilter(filter: ScopeFilter): void {
    if (filter.mode === 'auto' && !filter.intent?.trim()) {
      throw new ValidationError('AUTO 모드에서는 intent가 필요합니다');
    }
    if (filter.mode === 'manual' && (!filter.filters || filter.filters.dataTypes.length === 0)) {
      throw new ValidationError('MANUAL 모드에서는 dataTypes를 1개 이상 지정해야 합니다');
    }
  }

  private async collectDataIds(
    userId: string,
    scopeFilter: ScopeFilter
  ): Promise<{ conversations: string[]; notes: string[]; files: string[]; notionPages: string[] }> {
    const since = scopeFilter.mode === 'manual'
      ? resolveSinceDateFromPeriod(scopeFilter.filters?.createdPeriod)
      : new Date(0);

    const dataTypes = scopeFilter.mode === 'manual'
      ? (scopeFilter.filters?.dataTypes ?? [])
      : (['chat', 'note', 'file', 'notion'] as const);

    const [convDocs, noteDocs, fileDocs, notionDocs] = await Promise.all([
      dataTypes.includes('chat')
        ? this.conversationRepo.findModifiedSince(userId, since).then((docs) => docs.map((d) => String(d._id)))
        : Promise.resolve([]),
      dataTypes.includes('note')
        ? this.noteRepo.findNotesModifiedSince(userId, since).then((docs) => docs.map((d) => String(d._id)))
        : Promise.resolve([]),
      dataTypes.includes('file')
        ? (scopeFilter.mode === 'auto' || !scopeFilter.filters?.createdPeriod
          ? this.userFileRepo.listAllActive(userId).then((docs) => docs.map((d) => String(d._id)))
          : this.userFileRepo.findModifiedSince(userId, since).then((docs) => docs.map((d) => String(d._id))))
        : Promise.resolve([]),
      dataTypes.includes('notion')
        ? this.notionCacheRepo.findPagesModifiedSince(userId, since).then((docs) => docs.map((d) => String(d._id)))
        : Promise.resolve([]),
    ]);

    return {
      conversations: convDocs,
      notes: noteDocs,
      files: fileDocs,
      notionPages: notionDocs,
    };
  }
}
