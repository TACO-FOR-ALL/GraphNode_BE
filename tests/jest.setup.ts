// Global Jest setup for the project
// Use fake timers only when needed in specific test files via jest.useFakeTimers()

// Mock Redis to prevent connection errors during tests
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    quit: jest.fn(),
    disconnect: jest.fn(),
    isOpen: true,
  })),
}));

jest.mock('connect-redis', () => {
  const session = require('express-session');
  const Store = session.Store;
  const store = new Map();
  return {
    RedisStore: class extends Store {
      constructor() { super(); }
      get(sid: string, cb: any) { 
        cb(null, store.get(sid)); 
      }
      set(sid: string, sess: any, cb: any) { 
        store.set(sid, sess); 
        cb(null); 
      }
      destroy(sid: string, cb: any) { store.delete(sid); cb(null); }
      on(event: string, cb: any) { }
      touch(sid: string, sess: any, cb: any) { cb(null); }
    }
  };
});

export {};
