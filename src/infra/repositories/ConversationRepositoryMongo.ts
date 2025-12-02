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
import { Collection, FindOptions, ClientSession, ModifyResult, DeleteResult, UpdateResult } from 'mongodb';

import { ConversationRepository } from '../../core/ports/ConversationRepository';
import { getMongo } from '../db/mongodb';
import type { ConversationDoc } from '../../core/types/persistence/ai.persistence';
import { NotFoundError } from '../../shared/errors/domain';

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
    // insertOne: 문서 하나를 컬렉션에 추가합니다.
    await this.col().insertOne(doc, { session });
    return doc;
  }

  /**
   * ID로 대화를 조회합니다.
   * 
   * @param id 대화 ID (_id 필드와 매핑)
   * @param ownerUserId 소유자 ID (보안을 위해 함께 확인)
   * @param session (선택) 트랜잭션 세션
   * @returns 대화 문서 또는 null
   */
  async findById(id: string, ownerUserId: string, session?: ClientSession): Promise<ConversationDoc | null> {
    // findOne: 조건에 맞는 문서 하나를 찾습니다.
    return await this.col().findOne({ _id: id, ownerUserId }, { session });
  }

  /**
   * 소유자 기준으로 대화 목록을 조회합니다 (페이징 지원).
   * 
   * @param ownerUserId 소유자 ID
   * @param limit 한 번에 가져올 개수
   * @param cursor 페이징 커서 (updatedAt 기준)
   * @returns 대화 문서 목록과 다음 커서
   */
  async listByOwner(ownerUserId: string, limit: number, cursor?: string): Promise<{ items: ConversationDoc[]; nextCursor?: string | null }> {
    // 기본 쿼리: 해당 사용자의 대화만 조회
    const query: any = { ownerUserId };
    
    // 커서가 있다면, 그 커서(시간)보다 이전의 데이터만 조회 (최신순 정렬이므로)
    if (cursor) {
      query.updatedAt = { $lt: parseInt(cursor, 10) };
    }

    // 옵션 설정: 업데이트 시간 내림차순 정렬, 개수 제한
    const options: FindOptions<ConversationDoc> = {
      sort: { updatedAt: -1 },
      limit,
    };

    // 쿼리 실행 및 배열로 변환
    const items: ConversationDoc[] = await this.col().find(query, options).toArray();
    
    // 다음 커서 계산 (마지막 아이템의 updatedAt)
    const last: ConversationDoc | undefined = items[items.length - 1];
    const nextCursor: string | null = items.length === limit && last?.updatedAt ? String(last.updatedAt) : null;

    return { items, nextCursor };
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
  async update(id: string, ownerUserId: string, updates: Partial<ConversationDoc>, session?: ClientSession): Promise<ConversationDoc | null> {
    // findOneAndUpdate: 찾아서 수정하고 결과를 반환합니다.
    const result : ModifyResult<ConversationDoc> = await this.col().findOneAndUpdate(
      { _id: id, ownerUserId }, // 조건
      { $set: { ...updates, updatedAt: Date.now() } }, // 수정 내용 ($set 연산자 사용)
      { returnDocument: 'after', includeResultMetadata: true, session } // 옵션: 수정 후 문서 반환
    );

    if (!result || !result.value) {
      return null;
    }

    return result.value;
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
    // deleteOne: 조건에 맞는 문서 하나를 삭제합니다.
    const result : DeleteResult = await this.col().deleteOne({ _id: id, ownerUserId }, { session });
    
    // 삭제된 문서가 없으면 에러 발생
    if (result.deletedCount === 0) {
      throw new NotFoundError(`Conversation with id ${id} not found for user ${ownerUserId}`);
    }
    return true;
  }

  async softDelete(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    const result : UpdateResult<ConversationDoc> = await this.col().updateOne(
      { _id: id, ownerUserId },
      { $set: { deletedAt: Date.now(), updatedAt: Date.now() } },
      { session }
    );
    return result.modifiedCount > 0;
  }

  async hardDelete(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    const result : DeleteResult = await this.col().deleteOne({ _id: id, ownerUserId }, { session });
    return result.deletedCount > 0;
  }

  async restore(id: string, ownerUserId: string, session?: ClientSession): Promise<boolean> {
    const result = await this.col().updateOne(
      { _id: id, ownerUserId },
      { $set: { deletedAt: null, updatedAt: Date.now() } },
      { session }
    );
    return result.modifiedCount > 0;
  }

  async findModifiedSince(ownerUserId: string, since: Date): Promise<ConversationDoc[]> {
    return this.col().find({
      ownerUserId,
      updatedAt: { $gte: since.getTime() }
    }).toArray();
  }
}
