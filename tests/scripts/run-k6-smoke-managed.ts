/* eslint-disable no-console */
/// <reference types="node" />
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

function commandName(base: string): string {
  return process.platform === 'win32' ? `${base}.cmd` : base;
}

function runStep(
  title: string,
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: NodeJS.ProcessEnv; allowFail?: boolean }
): number {
  console.log(`\n[k6-managed] ${title}`);
  console.log(`[k6-managed] > ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: opts?.cwd,
    env: opts?.env ?? process.env,
  });

  const code = res.status ?? 1;
  if (code !== 0 && !opts?.allowFail) {
    throw new Error(`[k6-managed] step failed (${title}), exitCode=${code}`);
  }
  return code;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[k6-managed] missing env: ${name}`);
  return value;
}

/**
 * k6 웹 대시보드 + HTML 리포트 (k6-test/scripts/docker-k6-dashboard.mjs 와 동일 정책)
 * 끄기: K6_NO_WEB_DASHBOARD=1
 */
function injectK6WebDashboard(
  dockerArgs: string[],
  k6Dir: string,
  reportTag: string
): { dashboardUrl: string | null; reportAbsPath: string | null } {
  const off = process.env.K6_NO_WEB_DASHBOARD;
  if (off === '1' || off === 'true') {
    return { dashboardUrl: null, reportAbsPath: null };
  }

  const reportsDir = path.join(k6Dir, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const hostPort = process.env.K6_WEB_DASHBOARD_HOST_PORT ?? '5665';
  const containerPort = process.env.K6_WEB_DASHBOARD_PORT ?? '5665';
  const rawExport = process.env.K6_WEB_DASHBOARD_EXPORT;
  let exportInContainer: string;
  let reportFileName: string;

  if (rawExport && rawExport.startsWith('/work/')) {
    exportInContainer = rawExport;
    reportFileName = path.basename(rawExport);
  } else if (rawExport) {
    reportFileName = path.basename(rawExport.replace(/\\/g, '/'));
    exportInContainer = `/work/reports/${reportFileName}`;
  } else {
    const fn = process.env.K6_WEB_DASHBOARD_EXPORT_FILENAME;
    if (fn) {
      reportFileName = path.basename(fn.replace(/\\/g, '/'));
      exportInContainer = `/work/reports/${reportFileName}`;
    } else {
      const safeTag = String(reportTag).replace(/[^a-zA-Z0-9._-]+/g, '-');
      reportFileName = `k6-${safeTag}-${Date.now()}.html`;
      exportInContainer = `/work/reports/${reportFileName}`;
    }
  }

  const reportAbsPath = path.join(reportsDir, reportFileName);
  const vIndex = dockerArgs.indexOf('-v');
  if (vIndex === -1) throw new Error('[k6-managed] docker args missing -v');
  dockerArgs.splice(vIndex, 0, '-p', `${hostPort}:${containerPort}`);

  const imgIndex = dockerArgs.indexOf('grafana/k6');
  if (imgIndex === -1) throw new Error('[k6-managed] docker args missing grafana/k6');
  const hostBind = process.env.K6_WEB_DASHBOARD_HOST ?? '0.0.0.0';
  dockerArgs.splice(
    imgIndex,
    0,
    '-e',
    'K6_WEB_DASHBOARD=true',
    '-e',
    `K6_WEB_DASHBOARD_HOST=${hostBind}`,
    '-e',
    `K6_WEB_DASHBOARD_EXPORT=${exportInContainer}`
  );

  return {
    dashboardUrl: `http://127.0.0.1:${hostPort}`,
    reportAbsPath,
  };
}

/**
 * k6 스모크 테스트를 "생성 -> 실행 -> 삭제"로 관리하는 오케스트레이션 스크립트
 *
 * 특징:
 * - 테스트 실행 성공/실패와 무관하게 finally 단계에서 삭제를 시도한다.
 * - 로컬에서 실행하되, Infisical 환경변수(예: staging DB)로 서버 자원에 대해 계정 생성 가능.
 */
async function main() {
  const baseUrl = getRequiredEnv('BASE_URL');
  const testLoginSecret = getRequiredEnv('TEST_LOGIN_SECRET');
  const vus = process.env.VUS ?? '1';
  const usersCount =
    process.env.K6_SEED_COUNT !== undefined && String(process.env.K6_SEED_COUNT).trim() !== ''
      ? process.env.K6_SEED_COUNT
      : vus;
  const usersPrefix = process.env.K6_USERS_PREFIX ?? 'k6-user';
  const usersDomain = process.env.K6_USERS_EMAIL_DOMAIN ?? 'load.local';
  const profile = (process.env.K6_PROFILE ?? 'auth').toLowerCase();
  const k6Script =
    process.env.K6_SCRIPT ?? (profile === 'full' ? 'smoke/smoke.js' : 'smoke/smoke-auth.js');
  const includeOptionalIds = process.env.INCLUDE_OPTIONAL_IDS ?? 'false';

  const beRoot = path.resolve(__dirname, '../..');
  const repoRoot = path.resolve(beRoot, '..');
  const k6Dir = path.resolve(repoRoot, 'k6-test');

  const npmCmd = commandName('npm');
  const dockerCmd = commandName('docker');

  let k6ExitCode = 1;

  try {
    // 1) 테스트 계정 생성
    runStep(
      '테스트 사용자 생성',
      npmCmd,
      ['run', 'k6:users:create'],
      {
        cwd: beRoot,
        env: {
          ...process.env,
          K6_USERS_COUNT: usersCount,
          K6_USERS_PREFIX: usersPrefix,
          K6_USERS_EMAIL_DOMAIN: usersDomain,
        },
      }
    );

    // 2) k6 실행 (Docker)
    console.log(`[k6-managed] profile=${profile}, script=${k6Script}, vus=${vus}`);
    const dockerArgs = [
      'run',
      '--rm',
      '-i',
      '-v',
      `${k6Dir}:/work`,
      '-w',
      '/work',
      'grafana/k6',
      'run',
      k6Script,
      '-e',
      `BASE_URL=${baseUrl}`,
      '-e',
      `TEST_LOGIN_SECRET=${testLoginSecret}`,
      '-e',
      'USE_TEST_LOGIN=true',
      '-e',
      `INCLUDE_OPTIONAL_IDS=${includeOptionalIds}`,
      '-e',
      `VUS=${vus}`,
      '-e',
      `TEST_USERS_PREFIX=${usersPrefix}`,
    ];

    const dash = injectK6WebDashboard(dockerArgs, k6Dir, `smoke-${profile}`);
    if (dash.dashboardUrl) {
      console.log(`[k6-managed] web dashboard: ${dash.dashboardUrl}`);
      console.log(`[k6-managed] HTML report (after run): ${dash.reportAbsPath}`);
    }

    k6ExitCode = runStep('k6 스모크 실행', dockerCmd, dockerArgs, {
      cwd: repoRoot,
      allowFail: true,
    });
  } finally {
    // 3) 테스트 사용자 삭제 (항상 실행)
    runStep(
      '테스트 사용자 삭제',
      npmCmd,
      ['run', 'k6:users:delete'],
      {
        cwd: beRoot,
        env: {
          ...process.env,
          K6_USERS_PREFIX: usersPrefix,
        },
        allowFail: true,
      }
    );
  }

  process.exit(k6ExitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
