/**
 * 모듈: HttpClient (HTTP 통신 클라이언트)
 * 
 * 책임:
 * - 외부 API(OpenAI, Google 등)와 통신하기 위한 표준화된 클라이언트를 제공합니다.
 * - Axios 라이브러리를 래핑(Wrapping)하여 사용합니다.
 * - 로깅, 에러 처리, 요청 추적(Correlation ID) 기능을 자동으로 수행합니다.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

import { logger } from '../../shared/utils/logger';
import { UpstreamError, UpstreamTimeout } from '../../shared/errors/domain';
import { getCorrelationId } from '../../shared/context/requestStore'; 

/**
 * HttpClient 설정 인터페이스
 */
export interface HttpClientConfig {
  baseURL: string; // API 기본 주소
  timeout?: number; // 타임아웃 (밀리초)
  headers?: Record<string, string>; // 기본 헤더
}

/**
 * HttpClient 클래스
 * 
 * 외부 서비스와의 통신을 담당하는 클래스입니다.
 * 모든 요청/응답을 자동으로 로깅하고, 에러 발생 시 표준 AppError로 변환합니다.
 */
export class HttpClient {
  private readonly client: AxiosInstance;
  private readonly serviceName: string;

  /**
   * 생성자
   * @param serviceName 대상 서비스 이름 (로그용, 예: 'OpenAI', 'Google')
   * @param config 설정 객체
   */
  constructor(serviceName: string, config: HttpClientConfig) {
    this.serviceName = serviceName;
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 10000, // 기본 10초 타임아웃
      maxBodyLength: Infinity, // 용량 제한 해제
      maxContentLength: Infinity, // 용량 제한 해제
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    });

    // 인터셉터(가로채기) 설정
    this.setupInterceptors();
  }

  /**
   * Axios 인터셉터 설정 (내부 메서드)
   * 
   * 역할:
   * 1. 요청 전: 로그 출력, Correlation ID 헤더 추가
   * 2. 응답 후: 성공 로그 출력
   * 3. 에러 발생 시: 에러 로그 출력 및 표준 에러(UpstreamError)로 변환
   */
  private setupInterceptors(): void {
    // 요청 인터셉터
    this.client.interceptors.request.use(
      (config) => {
        const correlationId = getCorrelationId();
        // 현재 요청의 추적 ID가 있다면 헤더에 포함시켜 전파
        if (correlationId) {
          config.headers['X-Correlation-ID'] = correlationId;
        }
        // 요청 시작 로그
        logger.info(
          {
            event: 'http.request.start',
            service: this.serviceName,
            method: config.method?.toUpperCase(),
            url: `${config.baseURL}${config.url}`,
            correlationId,
          },
          `Request to ${this.serviceName}`
        );
        return config;
      },
      (error) => {
        logger.error(
          {
            event: 'http.request.error',
            service: this.serviceName,
            error: error.message,
          },
          `Request error to ${this.serviceName}`
        );
        return Promise.reject(error);
      }
    );

    // 응답 인터셉터
    this.client.interceptors.response.use(
      (response) => {
        // 응답 성공 로그
        logger.info(
          {
            event: 'http.response.success',
            service: this.serviceName,
            status: response.status,
            correlationId: response.config.headers['X-Correlation-ID'],
          },
          `Response from ${this.serviceName}`
        );
        return response;
      },
      (error: AxiosError) => {
        const correlationId = error.config?.headers['X-Correlation-ID'];
        // 응답 에러 로그
        logger.error(
          {
            event: 'http.response.error',
            service: this.serviceName,
            status: error.response?.status,
            error: error.message,
            correlationId,
          },
          `Error response from ${this.serviceName}`
        );

        // 타임아웃 에러 처리
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          throw new UpstreamTimeout(
            `Timeout from ${this.serviceName}`,
            { service: this.serviceName, detail: error.message }
          );
        }

        // 그 외 업스트림 에러 처리
        throw new UpstreamError(
          `Error from ${this.serviceName}`,
          { service: this.serviceName, status: error.response?.status, detail: error.message }
        );
      }
    );
  }

  /**
   * GET 요청 메서드
   */
  async get<T>(path: string, params?: Record<string, any>): Promise<T> {
    const response = await this.client.get<T>(path, { params });
    return response.data;
  }

  /**
   * POST 요청 메서드
   */
  async post<T>(path: string, data: any): Promise<T> {
    const response = await this.client.post<T>(path, data);
    return response.data;
  }

  /**
   * PUT 요청 메서드
   */
  async put<T>(path: string, data: any): Promise<T> {
    const response = await this.client.put<T>(path, data);
    return response.data;
  }

  /**
   * PATCH 요청 메서드
   */
  async patch<T>(path: string, data: any): Promise<T> {
    const response = await this.client.patch<T>(path, data);
    return response.data;
  }

  /**
   * DELETE 요청 메서드
   */
  async delete<T>(path: string): Promise<T> {
    const response = await this.client.delete<T>(path);
    return response.data;
  }
}
