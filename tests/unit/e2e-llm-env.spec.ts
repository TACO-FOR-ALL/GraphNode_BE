import {
  applyE2eGroqTestOnlyPolicy,
  applyE2eLlmEnvAliases,
  isE2eGroqLlmEnabled,
  isE2eLlmEnabled,
  resolveOpenAiApiKeyForE2e,
} from '../e2e/utils/e2e-llm-env';

describe('e2e-llm-env aliases', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('maps OPEN_API_KEY to OPENAI_API_KEY when canonical is placeholder', () => {
    process.env.OPENAI_API_KEY = 'sk-placeholder';
    process.env.OPEN_API_KEY = 'sk-from-legacy-var';
    applyE2eLlmEnvAliases();
    expect(process.env.OPENAI_API_KEY).toBe('sk-from-legacy-var');
    expect(resolveOpenAiApiKeyForE2e()).toBe('sk-from-legacy-var');
    expect(isE2eLlmEnabled()).toBe(true);
  });

  it('ignores GROQ_API_KEY unless E2E_PREFER_GROQ=1', () => {
    process.env.OPENAI_API_KEY = 'sk-placeholder';
    process.env.GROQ_API_KEY = 'gsk-test-only';
    delete process.env.E2E_PREFER_GROQ;
    applyE2eGroqTestOnlyPolicy();
    expect(isE2eGroqLlmEnabled()).toBe(false);
    expect(process.env.GROQ_API_KEY).toBeUndefined();
  });

  it('enables Groq LLM only when E2E_PREFER_GROQ=1', () => {
    process.env.GROQ_API_KEY = 'gsk-test-only';
    process.env.E2E_PREFER_GROQ = '1';
    expect(isE2eGroqLlmEnabled()).toBe(true);
  });
});
