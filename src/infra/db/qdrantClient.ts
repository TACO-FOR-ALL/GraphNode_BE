
/**
 * Qdrant Client Initialization
 */

import { QdrantClientAdapter } from '../repositories/QdrantClientAdapter';
import { logger } from '../../shared/utils/logger';
import { VectorStore } from '../../core/ports/VectorStore';

let qdrantAdapter: VectorStore | undefined;

/**
 * Qdrant 초기화 (스켈레톤)
 * @param url Qdrant endpoint
 * @param apiKey API key
 */
export async function initQdrant(url: string, apiKey?: string) {
    qdrantAdapter = new QdrantClientAdapter(url, apiKey);
    logger.info({ event: 'db.connected', system: 'qdrant' }, 'Qdrant adapter initialized (stub)');
    return qdrantAdapter;
}

/**
 * 초기화된 어댑터 반환
 */
export function getQdrantAdapter() {
    if (!qdrantAdapter) throw new Error('Qdrant not initialized');
    return qdrantAdapter;
}