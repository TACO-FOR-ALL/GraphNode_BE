import { PostHog } from 'posthog-node';
import { logger } from './logger';

let posthogClient: PostHog | null = null;

export const initPostHog = () => {
  if (process.env.POSTHOG_API_KEY && process.env.POSTHOG_HOST) {
    posthogClient = new PostHog(process.env.POSTHOG_API_KEY, {
      host: process.env.POSTHOG_HOST,
    });
    logger.info('PostHog initialized');
  } else {
    logger.warn('PostHog API Key or Host not found. Analytics disabled.');
  }
};

export const getPostHogClient = () => posthogClient;

export const shutdownPostHog = async () => {
  if (posthogClient) {
    await posthogClient.shutdown();
    logger.info('PostHog client shutdown');
  }
};
