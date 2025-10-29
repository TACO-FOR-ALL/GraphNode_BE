/**
 * 모듈: Graph Controller
 * 책임: Graph 관련 HTTP 요청을 처리하고, 서비스 레이어를 호출하여 응답을 반환한다.
 * 외부 의존:
 * - express: Request, Response 타입
 * - GraphService: 그래프 비즈니스 로직
 */



import { GraphVectorService } from "../../core/services/GraphVectorService";

export class GraphController {
    constructor(
        private readonly graphService: GraphVectorService
    ) {}

    //TODO :  필요한 메서드들 구현하기



}

