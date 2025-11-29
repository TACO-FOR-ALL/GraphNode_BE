/**
 * 모듈: Async Handler (비동기 에러 처리기)
 * 
 * 책임:
 * - Express 라우터에서 비동기(async) 함수를 사용할 때 발생하는 에러를 처리합니다.
 * - try-catch 블록을 매번 작성하지 않아도 되도록 도와줍니다.
 * 
 * 배경:
 * - Express 4.x 버전은 비동기 함수에서 발생한 에러를 자동으로 잡지 못합니다.
 * - 따라서 에러가 발생하면 서버가 멈추거나 응답이 오지 않는 문제가 생길 수 있습니다.
 * - 이 래퍼(Wrapper) 함수는 에러를 잡아서 next() 함수로 넘겨주어, 중앙 에러 핸들러가 처리할 수 있게 합니다.
 */
import type { Request, Response, NextFunction } from 'express';

/**
 * 비동기 핸들러 래퍼 함수
 * 
 * @param fn 비동기 컨트롤러 함수 (Promise를 반환하는 함수)
 * @returns 에러 처리가 추가된 Express 미들웨어 함수
 * 
 * 사용 예시:
 * router.get('/users', asyncHandler(async (req, res) => {
 *   const users = await userService.findAll(); // 여기서 에러 나면 자동으로 catch됨
 *   res.json(users);
 * }));
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return function (req: Request, res: Response, next: NextFunction) {
    // fn 실행 결과를 Promise.resolve로 감싸고,
    // 에러가 발생하면(.catch) next 함수를 호출하여 에러 미들웨어로 전달합니다.
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
