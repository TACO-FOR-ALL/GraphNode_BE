/**
 * @file src/infra/http/httpClient.ts
 * @description A generic HTTP client for external API communication.
 * @module infra/http/httpClient
 *
 * @requires axios
 * @requires src/shared/utils/logger
 * @requires src/shared/errors/domain
 * @requires src/shared/context/cls
 *
 * @see MVS.instructions.md - This module belongs to the infra layer.
 * @see LogCentrally.instructions.md - Logs should be structured and include correlationId.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

import { logger } from '../../shared/utils/logger';
import { UpstreamError, UpstreamTimeout } from '../../shared/errors/domain';
import { getCorrelationId } from '../../shared/context/requestStore'; 

/**
 * Configuration interface for creating a new HttpClient.
 * @property baseURL - The base URL for all requests.
 * @property timeout - The request timeout in milliseconds.
 * @property headers - Default headers to be sent with every request.
 */
export interface HttpClientConfig {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
}

/**
 * A wrapper around Axios to provide a standardized HTTP client for external services.
 * It includes request/response logging, error normalization, and correlation ID propagation.
 */
export class HttpClient {
  private readonly client: AxiosInstance;
  private readonly serviceName: string;

  /**
   * Creates an instance of HttpClient.
   * @param serviceName - The name of the external service for logging purposes.
   * @param config - The configuration for the Axios instance.
   */
  constructor(serviceName: string, config: HttpClientConfig) {
    this.serviceName = serviceName;
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 10000, // 10 seconds default
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        const correlationId = getCorrelationId();
        if (correlationId) {
          config.headers['X-Correlation-ID'] = correlationId;
        }
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

    this.client.interceptors.response.use(
      (response) => {
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

        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          throw new UpstreamTimeout(
            `Timeout from ${this.serviceName}`,
            { service: this.serviceName, detail: error.message }
          );
        }

        throw new UpstreamError(
          `Error from ${this.serviceName}`,
          { service: this.serviceName, status: error.response?.status, detail: error.message }
        );
      }
    );
  }

  /**
   * Performs a GET request.
   * @param path - The URL path to request.
   * @param params - The URL parameters to be sent with the request.
   * @returns The response data.
   */
  async get<T>(path: string, params?: Record<string, any>): Promise<T> {
    const response = await this.client.get<T>(path, { params });
    return response.data;
  }

  /**
   * Performs a POST request.
   * @param path - The URL path to request.
   * @param data - The data to be sent as the request body.
   * @returns The response data.
   */
  async post<T>(path: string, data: any): Promise<T> {
    const response = await this.client.post<T>(path, data);
    return response.data;
  }

  /**
   * Performs a PUT request.
   * @param path - The URL path to request.
   * @param data - The data to be sent as the request body.
   * @returns The response data.
   */
  async put<T>(path: string, data: any): Promise<T> {
    const response = await this.client.put<T>(path, data);
    return response.data;
  }

  /**
   * Performs a PATCH request.
   * @param path - The URL path to request.
   * @param data - The data to be sent as the request body.
   * @returns The response data.
   */
  async patch<T>(path: string, data: any): Promise<T> {
    const response = await this.client.patch<T>(path, data);
    return response.data;
  }

  /**
   * Performs a DELETE request.
   * @param path - The URL path to request.
   * @returns The response data.
   */
  async delete<T>(path: string): Promise<T> {
    const response = await this.client.delete<T>(path);
    return response.data;
  }
}
