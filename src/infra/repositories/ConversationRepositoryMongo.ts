/**
 * 모듈: ConversationRepository MongoDB 구현체
 *
 * 책임:
 * - MongoDB의 'conversations' 컬렉션에 직접 접근하여 데이터를 읽고 씁니다.
 * - ConversationRepository 인터페이스(Port)를 구현(Implements)합니다.
 * - DB 드라이버(mongodb)를 사용하여 실제 쿼리를 수행합니다.
 *
 * 이 클래스는 'Adapter' 역할을 하며, 비즈니스 로직이 DB 세부 사항을 알 필요가 없도록 감싸줍니다.
 */
import {
  Collection,
  FindOptions,
  ClientSession,
  ModifyResult,
  DeleteResult,
  UpdateResult,
} from 'mongodb';

import { ConversationRepository } from '../../core/ports/ConversationRepository';
import { getMongo } from '../db/mongodb';
import type { ConversationDoc } from '../../core/types/persistence/ai.persistence';
import { NotFoundError, UpstreamError } from '../../shared/errors/domain';

/**
 * ConversationRepositoryMongo 클래스
 *
 * MongoDB를 사용하는 대화 저장소 구현체입니다.
 *
 * **규칙**: Repository는 오직 Persistence Type(`*Doc`)만 다룹니다.
 * DTO 변환은 Service 계층에서 수행해야 합니다.
 */
export class ConversationRepositoryMongo implements ConversationRepository {
  /**
   * 내부 헬퍼 메서드: MongoDB 컬렉션 객체를 가져옵니다.
   *
   * @returns 'conversations' 컬렉션 객체
   */
  private col(): Collection<ConversationDoc> {
    return getMongo().db().collection<ConversationDoc>('conversations');
  }

  /**
   * 신규 대화를 생성(저장)합니다.
   *
   * @param doc 저장할 대화 문서 객체
   * @param session (선택) 트랜잭션 처리를 위한 세션 객체
   * @returns 저장된 대화 문서
   */
  async create(doc: ConversationDoc, session?: ClientSession): Promise<ConversationDoc> {
    try {
      const now = Date.now();
      doc.createdAt = now;
      doc.updatedAt = now;
      // insertOne: 문서 하나를 컬렉션에 추가합니다.
      await this.col().insertOne(doc, { session });
      return doc;
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.create', err);
    }
  }

  /**
   * 여러 대화를 한 번에 생성합니다 (Bulk Insert).
   *
   * @param docs 저장할 대화 문서 배열
   * @param session (선택) 트랜잭션 세션
   * @returns 저장된 대화 문서 배열
   */
  async createMany(docs: ConversationDoc[], session?: ClientSession): Promise<ConversationDoc[]> {
    try {
      if (docs.length === 0) {
        return [];
      }
      const now = Date.now();
      docs.forEach((d) => { d.createdAt = now; d.updatedAt = now; });
      // insertMany: 여러 문서를 한 번에 추가합니다.
      await this.col().insertMany(docs, { session });
      return docs;
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.createMany', err);
    }
  }

  /**
   * ID로 대화를 조회합니다.
   *
   * @param id 대화 ID (_id 필드와 매핑)
   * @param ownerUserId 소유자 ID (보안을 위해 함께 확인)
   * @param session (선택) 트랜잭션 세션
   * @returns 대화 문서 또는 null
   */
  async findById(
    id: string,
    ownerUserId: string,
    session?: ClientSession
  ): Promise<ConversationDoc | null> {
    try {
      // findOne: 조건에 맞는 문서 하나를 찾습니다.
      return await this.col().findOne({ _id: id, ownerUserId, deletedAt: null }, { session });
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.findById', err);
    }
  }

  /**
   * 소유자 기준으로 대화 목록을 조회합니다 (페이징 지원).
   *
   * @param ownerUserId 소유자 ID
   * @param limit 한 번에 가져올 개수
   * @param cursor 페이징 커서 (updatedAt 기준)
   * @returns 대화 문서 목록과 다음 커서
   */
  async listByOwner(
    ownerUserId: string,
    limit: number,
    cursor?: string
  ): Promise<{ items: ConversationDoc[]; nextCursor?: string | null }> {
    try {
      // 기본 쿼리: 해당 사용자의 대화 중 삭제되지 않은 데이터만 조회
      const query: any = { ownerUserId, deletedAt: null };

      // 커서가 있다면, 그 커서(시간)보다 이전의 데이터만 조회 (최신순 정렬이므로)
      // TODO: updatedAt 단독 커서는 동일 updatedAt 경계에서 항목 누락/중복 가능.
      //       향후 { updatedAt, _id } 복합 커서로 교체 권장 (인덱스에 _id:1 이미 포함됨).
      if (cursor) {
        query.updatedAt = { $lt: parseInt(cursor, 10) };
      }

      // 옵션 설정: 업데이트 시간 내림차순 정렬, 개수 제한
      const options: FindOptions<ConversationDoc> = {
        sort: { updatedAt: -1, _id: 1 },
        limit,
      };

      // 쿼리 실행 및 배열로 변환
      const items: ConversationDoc[] = await this.col().find(query, options).toArray();

      // 다음 커서 계산 (마지막 아이템의 updatedAt)
      const last: ConversationDoc | undefined = items[items.length - 1];
      const nextCursor: string | null =
        items.length === limit && last?.updatedAt ? String(last.updatedAt) : null;

      return { items, nextCursor };
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.listByOwner', err);
    }
  }

  /**
   * 대화 정보를 업데이트합니다.
   *
   * @param id 업데이트할 대화 ID
   * @param ownerUserId 소유자 ID
   * @param updates 업데이트할 필드들
   * @param session (선택) 트랜잭션 세션
   * @returns 업데이트된 대화 문서 또는 null
   */
  async update(
    id: string,
    ownerUserId: string,
    updates: Partial<ConversationDoc>,
    session?: ClientSession
  ): Promise<ConversationDoc | null> {
    try {
      // findOneAndUpdate: 찾아서 수정하고 결과를 반환합니다.
      const result: ModifyResult<ConversationDoc> = await this.col().findOneAndUpdate(
        { _id: id, ownerUserId }, // 조건
        { $set: { ...updates, updatedAt: Date.now() } }, // 수정 내용 ($set 연산자 사용)
        { returnDocument: 'after', includeResultMetadata: true, session } // 옵션: 수정 후 문서 반환
      );

      if (!result || !result.value) {
        return null;
      }

      return result.value;
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.update', err);
    }
  }

  /**
   * 대화를 삭제합니다.
   *
   * @param id 삭제할 대화 ID
   * @param ownerUserId 소유자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제 성공 여부
   * @throws {NotFoundError} 삭제할 대상을 찾지 못한 경우
   */
  async delete(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    try {
      // deleteOne: 조건에 맞는 문서 하나를 삭제합니다.
      const result: DeleteResult = await this.col().deleteOne({ _id: id, ownerUserId }, { session });

      // 삭제된 문서가 없으면 에러 발생
      if (result.deletedCount === 0) {
        throw new NotFoundError(`Conversation with id ${id} not found for user ${ownerUserId}`);
      }
      return true;
    } catch (err: unknown) {
      if (err instanceof NotFoundError) throw err;
      this.handleError('ConversationRepositoryMongo.delete', err);
    }
  }

  /**
   * 대화를 소프트 삭제합니다 (휴지통으로 이동).
   * @param id 대화 ID
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 수정 성공 여부
   */
  async softDelete(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    try {
      const result: UpdateResult<ConversationDoc> = await this.col().updateOne(
        { _id: id, ownerUserId },
        { $set: { deletedAt: Date.now(), updatedAt: Date.now() } },
        { session }
      );
      return result.modifiedCount > 0;
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.softDelete', err);
    }
  }

  /**
   * 대화를 영구 삭제(Hard Delete)합니다.
   * @param id 대화 ID
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제 성공 여부
   */
  async hardDelete(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    try {
      const result: DeleteResult = await this.col().deleteOne({ _id: id, ownerUserId }, { session });
      return result.deletedCount > 0;
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.hardDelete', err);
    }
  }

  /**
   * 소프트 삭제된 대화를 복구합니다.
   * @param id 대화 ID
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 복구 성공 여부
   */
  async restore(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    try {
      const result = await this.col().updateOne(
        { _id: id, ownerUserId },
        { $set: { deletedAt: null, updatedAt: Date.now() } },
        { session }
      );
      return result.modifiedCount > 0;
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.restore', err);
    }
  }

  /**
   * 사용자의 모든 대화를 영구 삭제합니다.
   * @param ownerUserId 소유자 사용자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제된 대화 수
   */
  async deleteAll(ownerUserId: string, session?: ClientSession): Promise<number> {
    try {
      const result = await this.col().deleteMany({ ownerUserId }, { session });
      return result.deletedCount;
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.deleteAll', err);
    }
  }

  /**
   * 특정 사용자의 모든 대화 ID만 조회합니다 (메모리 최적화용 Projection).
   * @param ownerUserId 소유자 ID
   * @returns 대화 ID 문자열 배열
   */
  async findAllIdsByOwner(ownerUserId: string): Promise<string[]> {
    try {
      const docs = await this.col()
        .find({ ownerUserId }, { projection: { _id: 1 } })
        .toArray();
      return docs.map((d) => d._id as unknown as string);
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.findAllIdsByOwner', err);
    }
  }

  /**
   * 주어진 ID 배열에 해당하는 대화를 일괄 삭제합니다 (Chunk Delete용).
   * @param ids 삭제할 대화 ID 배열
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제된 대화 수
   */
  async deleteByIds(ids: string[], session?: ClientSession): Promise<number> {
    if (ids.length === 0) return 0;
    try {
      const result = await this.col().deleteMany({ _id: { $in: ids } } as any, { session });
      return result.deletedCount;
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.deleteByIds', err);
    }
  }

  /**
   * 특정 시점 이후에 변경된 대화 목록을 조회합니다 (동기화용).
   * @param ownerUserId 소유자 사용자 ID
   * @param since 기준 시각
   * @returns 대화 문서 배열
   */
  async findModifiedSince(ownerUserId: string, since: Date): Promise<ConversationDoc[]> {
    try {
      return this.col()
        .find({
          ownerUserId,
          updatedAt: { $gte: since.getTime() },
        })
        .toArray();
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.findModifiedSince', err);
    }
  }

  /**
   * 휴지통에 있는 대화 목록을 조회합니다 (페이징 지원).
   * @param ownerUserId 소유자 사용자 ID
   * @param limit 가져올 개수
   * @param cursor 페이징 커서
   * @returns 대화 문서 목록과 다음 커서
   */
  async listTrashByOwner(
    ownerUserId: string,
    limit: number,
    cursor?: string
  ): Promise<{ items: ConversationDoc[]; nextCursor?: string | null }> {
    try {
      const query: any = { ownerUserId, deletedAt: { $ne: null } };

      if (cursor) {
        query.updatedAt = { $lt: parseInt(cursor, 10) };
      }

      const items: ConversationDoc[] = await this.col()
        .find(query)
        .sort({ updatedAt: -1 })
        .limit(limit)
        .toArray();

      const last = items[items.length - 1];
      const nextCursor = (items.length === limit && last?.updatedAt) ? String(last.updatedAt) : null;

      return { items, nextCursor };
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.listTrashByOwner', err);
    }
  }

  /**
   * 소프트 삭제된 지 오래되어 만료된 대화들을 영구 삭제합니다 (자동 정리용).
   * @param expiredBefore 기준 시각
   * @returns 삭제된 대화 수
   */
  async hardDeleteExpired(expiredBefore: Date): Promise<number> {
    try {
      const result = await this.col().deleteMany({
        deletedAt: { $ne: null, $lt: expiredBefore.getTime() },
      });
      return result.deletedCount;
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.hardDeleteExpired', err);
    }
  }

  /**
   * 소프트 삭제된 지 오래되어 만료된 대화 목록을 조회합니다 (자동 정리용).
   * @param expiredBefore 기준 시각
   * @returns 만료된 대화 문서 배열
   */
  async findExpiredConversations(expiredBefore: Date): Promise<ConversationDoc[]> {
    try {
      return await this.col()
        .find({
          deletedAt: { $ne: null, $lt: expiredBefore.getTime() },
        })
        .toArray();
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.findExpiredConversations', err);
    }
  }

  /**
   * 여러 ID에 해당하는 대화 문서들을 한 번에 조회합니다.
   *
   * @param ids 대화 ID 배열
   * @param ownerUserId 소유자 ID
   * @returns 대화 문서 배열
   */
  async findByIds(ids: string[], ownerUserId: string): Promise<ConversationDoc[]> {
    try {
      if (ids.length === 0) return [];
      return await this.col()
        .find({
          _id: { $in: ids },
          ownerUserId,
        })
        .toArray();
    } catch (err: unknown) {
      this.handleError('ConversationRepositoryMongo.findByIds', err);
    }
  }

  /**
   * 공통 에러 핸들러
   * @param methodName 호출한 메서드 이름
   * @param err 에러 객체
   */
  private handleError(methodName: string, err: unknown): never {
    if (
      err instanceof Error &&
      ((err as any).hasErrorLabel?.('TransientTransactionError') ||
        (err as any).hasErrorLabel?.('UnknownTransactionCommitResult'))
    ) {
      throw err;
    }
    throw new UpstreamError(`${methodName} failed`, { cause: String(err) });
  }
}
