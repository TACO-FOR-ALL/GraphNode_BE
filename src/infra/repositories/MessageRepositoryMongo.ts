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
    await this.col().insertOne(doc, { session });
    return doc;
  }

  /**
   * 여러 메시지를 한 번에 생성합니다 (Bulk Insert).
   *
   * @param docs 저장할 메시지 문서 배열
   * @param session (선택) 트랜잭션 세션
   * @returns 저장된 메시지 문서 배열
   */
  async createMany(docs: MessageDoc[], session?: ClientSession): Promise<MessageDoc[]> {
    if (docs.length === 0) {
      return [];
    }
    // insertMany: 여러 문서를 한 번에 추가합니다.
    await this.col().insertMany(docs, { session });
    return docs;
  }

  /**
   * ID로 메시지를 조회합니다.
   *
   * @param id 조회할 메시지 ID
   * @returns 조회된 메시지 문서 또는 null
   */
  async findById(id: string): Promise<MessageDoc | null> {
    return this.col().findOne({ _id: id });
  }

  /**
   * 특정 대화방에 속한 모든 메시지를 조회합니다.
   *
   * @param conversationId 대화방 ID
   * @returns 해당 대화방의 모든 메시지 문서 배열 (시간순 정렬)
   */
  async findAllByConversationId(conversationId: string): Promise<MessageDoc[]> {
    // find: 조건에 맞는 문서를 찾습니다.
    // sort({ ts: 1 }): 타임스탬프(ts) 오름차순(과거->미래)으로 정렬합니다.
    return await this.col().find({ conversationId }).sort({ ts: 1 }).toArray();
  }

  /**
   * 특정 사용자의 모든 메시지를 삭제합니다.
   * @param ownerUserId 소유자 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제된 메시지 수
   */
  async deleteAllByUserId(ownerUserId: string, session?: ClientSession): Promise<number> {
    const result = await this.col().deleteMany({ ownerUserId }, { session });
    return result.deletedCount;
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
    const result: DeleteResult = await this.col().deleteOne(
      { _id: id, conversationId },
      { session }
    );
    // deletedCount가 1이면 성공적으로 삭제된 것입니다.
    return result.deletedCount === 1;
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
    const result: UpdateResult<MessageDoc> = await this.col().updateOne(
      { _id: id, conversationId },
      { $set: { deletedAt: Date.now(), updatedAt: Date.now() } },
      { session }
    );
    return result.modifiedCount > 0;
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
    const result: DeleteResult = await this.col().deleteOne(
      { _id: id, conversationId },
      { session }
    );
    return result.deletedCount > 0;
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
    const result = await this.col().updateOne(
      { _id: id, conversationId },
      { $set: { deletedAt: null, updatedAt: Date.now() } },
      { session }
    );
    return result.modifiedCount > 0;
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
    return this.col()
      .find({
        ownerUserId,
        updatedAt: { $gte: since.getTime() },
      })
      .toArray();
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
    const result: UpdateResult<MessageDoc> = await this.col().updateMany(
      { conversationId },
      { $set: { deletedAt: Date.now(), updatedAt: Date.now() } },
      { session }
    );
    return result.modifiedCount;
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
    const result: DeleteResult = await this.col().deleteMany({ conversationId }, { session });
    return result.deletedCount;
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
    // deleteMany: 조건에 맞는 모든 문서를 삭제합니다.
    const result: DeleteResult = await this.col().deleteMany({ conversationId }, { session });
    return result.deletedCount;
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
    const result = await this.col().updateMany(
      { conversationId },
      { $set: { deletedAt: null, updatedAt: Date.now() } },
      { session }
    );
    return result.modifiedCount;
  }
}
