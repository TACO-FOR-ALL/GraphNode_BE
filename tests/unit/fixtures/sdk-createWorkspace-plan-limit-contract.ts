import type {
  CreateWorkspacePlanLimitExceededError,
  MicroscopeWorkspace,
} from '../../../z_npm_sdk/src/index';

const workspace: MicroscopeWorkspace = {
  _id: 'workspace_123',
  userId: 'user_123',
  name: 'Microscope workspace',
  documents: [],
  createdAt: '2026-06-26T00:00:00.000Z',
  updatedAt: '2026-06-26T00:00:00.000Z',
};

void workspace;

const problem: CreateWorkspacePlanLimitExceededError = {
  type: 'https://graphnode.dev/problems/plan-limit-exceeded',
  title: 'PLAN LIMIT EXCEEDED',
  status: 402,
  detail: 'Micro space plan limit exceeded.',
  instance: '/v1/microscope/nodes/ingest',
  retryable: false,
};

const status: 402 = problem.status;
const title: 'PLAN LIMIT EXCEEDED' = problem.title;
const retryable: false = problem.retryable;

void status;
void title;
void retryable;

// @ts-expect-error createWorkspace plan-limit responses must stay HTTP 402.
const wrongStatus: CreateWorkspacePlanLimitExceededError = { ...problem, status: 429 };

void wrongStatus;
