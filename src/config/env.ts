import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MYSQL_URL: z.url(),
  MONGODB_URL: z.url()
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map(i => `${String(i.path.join('.'))}: ${i.message}`)
      .join(', ');
    // eslint-disable-next-line no-console
    console.error('ENV_VALIDATION_FAILED:', issues);
    process.exit(1);
  }
  return parsed.data;
}
