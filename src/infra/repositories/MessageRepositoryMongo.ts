/**
 * 모듈: MessageRepository MongoDB 구현체
 *
 * 책임:
 * - MongoDB의 'messages' 컬렉션에 접근하여 메시지 데이터를 관리합니다.
 * - MessageRepository 인터페이스를 구현합니다.
 *
 * 이 클래스는 데이터베이스와 직접 통신하는 'Adapter'입니다.
 */
import { Collection, ClientSession, UpdateResult, DeleteResult, ModifyResult } from 'mongodb';

import { MessageRepository } from '../../core/ports/MessageRepository';
import { getMongo } from '../db/mongodb';
import type { MessageDoc } from '../../core/types/persistence/ai.persistence';
import { UpstreamError } from '../../shared/errors/domain';

/**
 * MessageRepositoryMongo 클래스
 *
 * MongoDB를 사용하는 메시지 저장소 구현체입니다.
 *
 * **규칙**: Repository는 오직 Persistence Type(`*Doc`)만 다룹니다.
 */
export class MessageRepositoryMongo implements MessageRepository {
  /**
   * 내부 헬퍼 메서드: 'messages' 컬렉션 객체를 반환합니다.
   */
  private col(): Collection<MessageDoc> {
    return getMongo().db().collection<MessageDoc>('messages');
  }

  /**
   * 단일 메시지를 생성(저장)합니다.
   *
   * @param doc 저장할 메시지 문서
   * @param session (선택) 트랜잭션 세션
   * @returns 저장된 메시지 문서
   */
  async create(doc: MessageDoc, session?: ClientSession): Promise<MessageDoc> {
    try {
      const now = Date.now();
      doc.createdAt = now;
      doc.updatedAt = now;
      await this.col().insertOne(doc, { session });
      return doc;
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.create', err);
    }
  }

  /**
   * 여러 메시지를 한 번에 생성합니다 (Bulk Insert).
   *
   * @param docs 저장할 메시지 문서 배열
   * @param session (선택) 트랜잭션 세션
   * @returns 저장된 메시지 문서 배열
   */
  async createMany(docs: MessageDoc[], session?: ClientSession): Promise<MessageDoc[]> {
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
      this.handleError('MessageRepositoryMongo.createMany', err);
    }
  }

  /**
   * ID로 메시지를 조회합니다.
   *
   * @param id 조회할 메시지 ID
   * @returns 조회된 메시지 문서 또는 null
   */
  async findById(id: string): Promise<MessageDoc | null> {
    try {
      return this.col().findOne({ _id: id, deletedAt: null });
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.findById', err);
    }
  }

  /**
   * 특정 대화방에 속한 모든 메시지를 조회합니다.
   *
   * @param conversationId 대화방 ID
   * @returns 해당 대화방의 모든 메시지 문서 배열 (시간순 정렬)
   */
  async findAllByConversationId(conversationId: string): Promise<MessageDoc[]> {
    try {
      // find: 조건에 맞는 문서를 찾습니다. (삭제되지 않은 메시지만)
      // sort({ createdAt: 1 }): 생성일(createdAt) 오름차순(과거->미래)으로 정렬합니다.
      return await this.col()
        .find({ conversationId, deletedAt: null })
        .sort({ createdAt: 1 })
        .toArray();
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.findAllByConversationId', err);
    }
  }

  /**
   * 여러 대화방에 속한 모든 메시지를 한 번에 조회합니다. (N+1 최적화)
   * @param conversationIds 대화방 ID 배열
   * @returns 메시지 문서 배열
   */
  async findAllByConversationIds(conversationIds: string[]): Promise<MessageDoc[]> {
    try {
      if (conversationIds.length === 0) return [];
      return await this.col()
        .find({ conversationId: { $in: conversationIds }, deletedAt: null })
        .sort({ createdAt: 1 })
        .toArray();
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.findAllByConversationIds', err);
    }
  }

  /**
   * 특정 사용자의 모든 메시지를 삭제합니다.
   * @param ownerUserId 소유자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제된 메시지 수
   */
  async deleteAllByUserId(ownerUserId: string, session?: ClientSession): Promise<number> {
    try {
      const result = await this.col().deleteMany({ ownerUserId }, { session });
      return result.deletedCount;
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.deleteAllByUserId', err);
    }
  }

  /**
   * 메시지 정보를 업데이트합니다.
   *
   * @param id 업데이트할 메시지 ID
   * @param conversationId 메시지가 속한 대화방 ID (검증용)
   * @param updates 업데이트할 필드들
   * @param session (선택) 트랜잭션 세션
   * @returns 업데이트된 메시지 문서 또는 null
   */
  async update(
    id: string,
    conversationId: string,
    updates: Partial<MessageDoc>,
    session?: ClientSession
  ): Promise<MessageDoc | null> {
    try {
      // 업데이트 시 updatedAt 필드도 현재 시간으로 갱신합니다.
      const partialDoc: Partial<MessageDoc> = { ...updates, updatedAt: Date.now() };

      const result: ModifyResult<MessageDoc> = await this.col().findOneAndUpdate(
        { _id: id, conversationId },
        { $set: partialDoc },
        { returnDocument: 'after', includeResultMetadata: true, session }
      );

      if (!result || !result.value) {
        return null;
      }
      return result.value;
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.update', err);
    }
  }

  /**
   * 메시지를 삭제합니다.
   *
   * @param id 삭제할 메시지 ID
   * @param conversationId 메시지가 속한 대화방 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제 성공 여부
   */
  async delete(id: string, conversationId: string, session?: ClientSession): Promise<boolean> {
    try {
      const result: DeleteResult = await this.col().deleteOne(
        { _id: id, conversationId },
        { session }
      );
      // deletedCount가 1이면 성공적으로 삭제된 것입니다.
      return result.deletedCount === 1;
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.delete', err);
    }
  }

  /**
   * 메시지를 소프트 삭제(Soft Delete)합니다.
   * 실제 데이터를 삭제하지 않고, deletedAt 필드에 현재 시간을 기록합니다.
   *
   * @param id 삭제할 메시지 ID
   * @param conversationId 메시지가 속한 대화방 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제(업데이트) 성공 여부
   */
  async softDelete(id: string, conversationId: string, session?: ClientSession): Promise<boolean> {
    try {
      const result: UpdateResult<MessageDoc> = await this.col().updateOne(
        { _id: id, conversationId },
        { $set: { deletedAt: Date.now(), updatedAt: Date.now() } },
        { session }
      );
      return result.modifiedCount > 0;
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.softDelete', err);
    }
  }

  /**
   * 메시지를 영구 삭제(Hard Delete)합니다.
   * DB에서 데이터를 완전히 제거합니다.
   *
   * @param id 삭제할 메시지 ID
   * @param conversationId 메시지가 속한 대화방 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제 성공 여부
   */
  async hardDelete(id: string, conversationId: string, session?: ClientSession): Promise<boolean> {
    try {
      const result: DeleteResult = await this.col().deleteOne(
        { _id: id, conversationId },
        { session }
      );
      return result.deletedCount > 0;
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.hardDelete', err);
    }
  }

  /**
   * 삭제된 메시지를 복구합니다.
   *
   * @param id 메시지 ID
   * @param conversationId 대화방 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 복구 성공 여부
   */
  async restore(id: string, conversationId: string, session?: ClientSession): Promise<boolean> {
    try {
      const result = await this.col().updateOne(
        { _id: id, conversationId },
        { $set: { deletedAt: null, updatedAt: Date.now() } },
        { session }
      );
      return result.modifiedCount > 0;
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.restore', err);
    }
  }

  /**
   * 특정 사용자의 변경된 메시지 목록을 조회합니다.
   * 동기화(Sync) 로직에서 사용됩니다.
   *
   * @param ownerUserId 사용자 ID
   * @param since 기준 시각 (이 시간 이후에 수정된 데이터만 조회)
   * @returns 변경된 메시지 문서 목록
   */
  async findModifiedSince(ownerUserId: string, since: Date): Promise<MessageDoc[]> {
    try {
      return this.col()
        .find({
          ownerUserId,
          updatedAt: { $gte: since.getTime() },
        })
        .toArray();
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.findModifiedSince', err);
    }
  }

  /**
   * 특정 대화방의 모든 메시지를 소프트 삭제합니다.
   * 대화방 삭제 시 해당 대화방의 메시지들도 함께 삭제 처리할 때 사용합니다.
   *
   * @param conversationId 대화방 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제(업데이트)된 메시지 개수
   */
  async softDeleteAllByConversationId(
    conversationId: string,
    session?: ClientSession
  ): Promise<number> {
    try {
      const result: UpdateResult<MessageDoc> = await this.col().updateMany(
        { conversationId },
        { $set: { deletedAt: Date.now(), updatedAt: Date.now() } },
        { session }
      );
      return result.modifiedCount;
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.softDeleteAllByConversationId', err);
    }
  }

  /**
   * 특정 대화방의 모든 메시지를 영구 삭제합니다.
   *
   * @param conversationId 대화방 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제된 메시지 개수
   */
  async hardDeleteAllByConversationId(
    conversationId: string,
    session?: ClientSession
  ): Promise<number> {
    try {
      const result: DeleteResult = await this.col().deleteMany({ conversationId }, { session });
      return result.deletedCount;
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.hardDeleteAllByConversationId', err);
    }
  }

  /**
   * 특정 대화방에 속한 모든 메시지를 삭제합니다.
   *
   * @param conversationId 대화방 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제된 메시지 개수
   */
  async deleteAllByConversationId(
    conversationId: string,
    session?: ClientSession
  ): Promise<number> {
    try {
      // deleteMany: 조건에 맞는 모든 문서를 삭제합니다.
      const result: DeleteResult = await this.col().deleteMany({ conversationId }, { session });
      return result.deletedCount;
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.deleteAllByConversationId', err);
    }
  }

  /**
   * 특정 대화방의 모든 메시지를 복구합니다.
   *
   * @param conversationId 대화방 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 복구된 메시지 개수
   */
  async restoreAllByConversationId(
    conversationId: string,
    session?: ClientSession
  ): Promise<number> {
    try {
      const result = await this.col().updateMany(
        { conversationId },
        { $set: { deletedAt: null, updatedAt: Date.now() } },
        { session }
      );
      return result.modifiedCount;
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.restoreAllByConversationId', err);
    }
  }

  /**
   * 여러 대화방 ID에 속한 모든 메시지를 일괄 삭제합니다 (Chunk Delete용).
   * @param conversationIds 삭제 대상 대화방 ID 배열
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제된 메시지 수
   */
  async deleteAllByConversationIds(
    conversationIds: string[],
    session?: ClientSession
  ): Promise<number> {
    if (conversationIds.length === 0) return 0;
    try {
      const result: DeleteResult = await this.col().deleteMany(
        { conversationId: { $in: conversationIds } },
        { session }
      );
      return result.deletedCount;
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.deleteAllByConversationIds', err);
    }
  }

  /**
   * 단일 대화방의 가장 최근 메시지를 조회합니다.
   *
   * @param conversationId 대화방 ID
   * @returns 가장 최근 메시지 문서, 없으면 null
   */
  async findLastMessageByConversationId(conversationId: string): Promise<MessageDoc | null> {
    try {
      return await this.col().findOne(
        { conversationId, deletedAt: null },
        { sort: { createdAt: -1 } }
      );
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.findLastMessageByConversationId', err);
    }
  }

  /**
   * 여러 대화방 각각의 가장 최근 메시지를 한 번의 집계 쿼리로 조회합니다.
   *
   * @description
   * `$match` → `$sort(createdAt desc)` → `$group(_id: conversationId, $first: $$ROOT)` 순으로
   * 집계하여 대화당 최신 메시지 1개만 반환합니다.
   * 전체 메시지를 로드한 뒤 애플리케이션 레벨에서 Map 덮어쓰기로 최신 메시지를 찾는
   * `findAllByConversationIds` 방식 대비 IO를 대폭 절감합니다.
   *
   * @param conversationIds 대화방 ID 배열
   * @returns 대화당 최신 메시지 1개씩 배열 (메시지가 없는 대화는 누락됨)
   */
  async findLastMessagesByConversationIds(conversationIds: string[]): Promise<MessageDoc[]> {
    try {
      if (conversationIds.length === 0) return [];
      const results = await this.col()
        .aggregate<{ _id: string; lastMsg: MessageDoc }>([
          { $match: { conversationId: { $in: conversationIds }, deletedAt: null } },
          { $sort: { createdAt: -1 } },
          { $group: { _id: '$conversationId', lastMsg: { $first: '$$ROOT' } } },
        ])
        .toArray();
      return results.map((r) => r.lastMsg);
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.findLastMessagesByConversationIds', err);
    }
  }

  /**
   * 메시지 내용에서 키워드로 검색합니다 (case-insensitive 부분 일치).
   *
   * @param ownerUserId 소유자 ID (역정규화 필드)
   * @param keyword 검색 키워드
   * @returns 내용에 키워드가 포함된 메시지 문서 배열
   */
  async searchByKeyword(ownerUserId: string, keyword: string): Promise<MessageDoc[]> {
    try {
      const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      return await this.col()
        .find({ ownerUserId, deletedAt: null, content: { $regex: regex } })
        .toArray();
    } catch (err: unknown) {
      this.handleError('MessageRepositoryMongo.searchByKeyword', err);
    }
  }

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
