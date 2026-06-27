import type {
  GenerateGraphOptions,
  GenerateGraphPlanLimitExceededError,
} from '../../../z_npm_sdk/src/index';

const options: GenerateGraphOptions = {
  includeSummary: true,
};

void options;

const problem: GenerateGraphPlanLimitExceededError = {
  type: 'https://graphnode.dev/problems/plan-limit-exceeded',
  title: 'PLAN LIMIT EXCEEDED',
  status: 402,
  detail: 'Macro view plan limit exceeded.',
  instance: '/v1/graph-ai/generate',
  retryable: false,
};

const status: 402 = problem.status;
const title: 'PLAN LIMIT EXCEEDED' = problem.title;
const retryable: false = problem.retryable;

void status;
void title;
void retryable;

// @ts-expect-error generateGraph plan-limit responses must stay HTTP 402.
const wrongStatus: GenerateGraphPlanLimitExceededError = { ...problem, status: 429 };

void wrongStatus;
