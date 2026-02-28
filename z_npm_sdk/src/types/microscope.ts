/**
 * @public
 * microscope 문서
 * @param id 문서 ID
 * @param s3Key S3 키 > 안씀
 * @param fileName 파일 이름
 * @param status 문서 상태
 * @param sourceId 소스 ID
 * @param graphPayloadId Microscope Graph 획득용 ID
 * @param error 에러
 * @param createdAt 생성일
 * @param updatedAt 업데이트일
 */
export interface MicroscopeDocument {
  id: string;
  s3Key: string;
  fileName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  sourceId?: string;
  graphPayloadId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}




/**
 * @public
 * microscope 워크스페이스
 * @param _id 워크스페이스 ID
 * @param userId 유저 ID
 * @param name 워크스페이스 이름
 * @param documents 문서 목록
 * @param createdAt 생성일
 * @param updatedAt 업데이트일
 */
export interface MicroscopeWorkspace {
  _id: string;
  userId: string;
  name: string;
  documents: MicroscopeDocument[];
  createdAt: string;
  updatedAt: string;
}

/**
 * @public
 * microscope 그래프 노드
 * @param id 노드 ID
 * @param name 노드 이름
 * @param type 노드 타입
 * @param description 노드 설명
 * @param source_chunk_id 소스 청크 ID
 */
export interface MicroscopeGraphNode {
  id: string;
  name: string;
  type: string;
  description: string;
  source_chunk_id: number | null;
}



/**
 * @public
 * microscope 그래프 엣지
 * @param id 엣지 ID
 * @param start 시작 노드 ID
 * @param target 끝 노드 ID
 * @param type 엣지 타입
 * @param description 엣지 설명
 * @param source_chunk_id 소스 청크 ID
 * @param evidence 엣지 증거
 * @param confidence 엣지 신뢰도
 */
export interface MicroscopeGraphEdge {
  id: string;
  start: string;
  target: string;
  type: string;
  description: string;
  source_chunk_id?: number | null;
  evidence: string;
  confidence: number;
}

/**
 * @public
 * microscope 그래프 데이터
 * @param nodes 노드 목록
 * @param edges 엣지 목록
 */
export interface MicroscopeGraphData {
  nodes: MicroscopeGraphNode[];
  edges: MicroscopeGraphEdge[];
}
