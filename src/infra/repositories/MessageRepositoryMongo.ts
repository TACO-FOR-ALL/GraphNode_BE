/**
 * 모듈: MessageRepository MongoDB 구현체
 * 
 * 책임:
 * - MongoDB의 'messages' 컬렉션에 접근하여 메시지 데이터를 관리합니다.
 * - MessageRepository 인터페이스를 구현합니다.
 * 
 * 이 클래스는 데이터베이스와 직접 통신하는 'Adapter'입니다.
 */
import { Collection, ClientSession } from 'mongodb';

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
   * 메시지 정보를 업데이트합니다.
   * 
   * @param id 업데이트할 메시지 ID
   * @param conversationId 메시지가 속한 대화방 ID (검증용)
   * @param updates 업데이트할 필드들
   * @param session (선택) 트랜잭션 세션
   * @returns 업데이트된 메시지 문서 또는 null
   */
  async update(id: string, conversationId: string, updates: Partial<MessageDoc>, session?: ClientSession): Promise<MessageDoc | null> {
    // 업데이트 시 updatedAt 필드도 현재 시간으로 갱신합니다.
    const partialDoc: Partial<MessageDoc> = { ...updates, updatedAt: Date.now() };

    const result = await this.col().findOneAndUpdate(
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
    const result = await this.col().deleteOne({ _id: id, conversationId }, { session });
    // deletedCount가 1이면 성공적으로 삭제된 것입니다.
    return result.deletedCount === 1;
  }

  /**
   * 특정 대화방에 속한 모든 메시지를 삭제합니다.
   * 
   * @param conversationId 대화방 ID
   * @param session (선택) 트랜잭션 세션
   * @returns 삭제된 메시지 개수
   */
  async deleteAllByConversationId(conversationId: string, session?: ClientSession): Promise<number> {
    // deleteMany: 조건에 맞는 모든 문서를 삭제합니다.
    const result = await this.col().deleteMany({ conversationId }, { session });
    return result.deletedCount;
  }
}
