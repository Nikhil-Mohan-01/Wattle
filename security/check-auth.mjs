// Run: node security/check-auth.mjs. Uses temporary files and synthetic accounts.
// Does not load .env.local, start a server, or send email.
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createClient } from '@libsql/client';

const root = resolve(import.meta.dirname, '..');
const temp = await mkdtemp(join(tmpdir(), 'wattle-security-'));
const originalLog = console.log;
const messages = [];
let client;
try {
  await symlink(join(root, 'node_modules'), join(temp, 'node_modules'));
  for (const file of ['db/client', 'db/schema', 'lib/auth', 'lib/auth-policy', 'lib/email']) {
    const source = await readFile(join(root, 'src', `${file}.ts`), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
    }}).outputText.replace(/import "server-only";\s*/g, '')
      .replace(/from "@\/([^"\n]+)"/g, (_, name) => `from "${pathToFileURL(join(temp, `${name}.mjs`))}"`)
      .replace(/from "(\.\.?\/[^"\n]+)"/g, 'from "$1.mjs"');
    await mkdir(dirname(join(temp, file)), { recursive: true });
    await writeFile(join(temp, `${file}.mjs`), compiled);
  }
  // Pin every environment variable used by the app; never use real credentials.
  Object.assign(process.env, {
    NODE_ENV: 'production', DATABASE_URL: `file:${join(temp, 'test.db')}`,
    DATABASE_AUTH_TOKEN: '', BETTER_AUTH_URL: 'https://security.example',
    BETTER_AUTH_SECRET: 'synthetic-security-test-secret-at-least-32-characters',
    SMTP_URL: '', EMAIL_FROM: 'test@example.invalid', AUTH_EMAIL_LINK_ENABLED: 'true',
    MICROSOFT_CLIENT_ID: '', MICROSOFT_CLIENT_SECRET: '', MICROSOFT_TENANT_ID: '',
    ALLOWED_EMAIL_DOMAINS: 'uwaterloo.ca',
  });
  client = createClient({ url: process.env.DATABASE_URL });
  // Minimal SQL mirror of src/db/schema.ts. Keep aligned when auth schema changes.
  await client.executeMultiple(`
    CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, handle TEXT, faculty TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE session (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, token TEXT UNIQUE NOT NULL,
      ip_address TEXT, user_agent TEXT, user_id TEXT NOT NULL REFERENCES user(id),
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE verification (id TEXT PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL,
      expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE account (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id), access_token TEXT, refresh_token TEXT, id_token TEXT,
      access_token_expires_at INTEGER, refresh_token_expires_at INTEGER, scope TEXT, password TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  `);
  // Capture development email output without exposing live bearer links in reports.
  console.log = (...args) => messages.push(args.join(' '));
  const { auth } = await import(pathToFileURL(join(temp, 'lib/auth.mjs')));
  const results = [];
  async function request(path, body, extras = {}) {
    return auth.handler(new Request(`https://security.example/api/auth${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://security.example',
        'x-forwarded-for': '192.0.2.1', ...extras },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
  }
  async function check(name, path, body, headers) {
    const response = await request(path, body, headers);
    results.push({ name, status: response.status });
    return response;
  }
  const email = 'security_probe@uwaterloo.ca';
  await check('reject foreign email', '/sign-in/magic-link', { email: 'probe@example.invalid' });
  await check('reject plus alias', '/sign-in/magic-link', { email: 'probe+alias@uwaterloo.ca' });
  await check('reject cross-origin POST', '/sign-in/magic-link', { email }, { origin: 'https://attacker.invalid' });
  const sent = await check('allowed email, no SMTP, production mode', '/sign-in/magic-link', { email });
  const link = messages.join('\n').match(/https:\/\/security\.example\/api\/auth\/magic-link\/verify\?[^\s]+/)?.[0];
  results.push({ name: 'production log contains bearer link', observed: Boolean(link) });
  // Use a separate synthetic IP for rate-limit tests.
  for (let i = 0; i < 4; i++) await check(`fixed IP request ${i + 1}`, '/sign-in/magic-link', { email }, { 'x-forwarded-for': '192.0.2.2' });
  await check('changed forwarded IP after limit', '/sign-in/magic-link', { email }, { 'x-forwarded-for': '192.0.2.3' });
  await check('unauthenticated profile update', '/update-user', { handle: 'attacker', faculty: 'math' });
  if (sent.ok && link) {
    const verification = await auth.handler(new Request(link));
    const cookie = verification.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    results.push({ name: 'magic link verification', status: verification.status, sessionCookie: cookie.includes('session_token=') });
    const replay = await auth.handler(new Request(link));
    results.push({ name: 'magic link replay rejected', observed: /[?&]error=/.test(replay.headers.get('location') ?? ''), sessionCookie: replay.headers.getSetCookie().some(c => /session_token=[^;]/.test(c)) });
    await check('authenticated mass assignment', '/update-user', { handle: 'attacker', faculty: 'math', emailVerified: false }, { cookie });
    const row = await client.execute('SELECT handle, faculty, email_verified FROM user LIMIT 1');
    results.push({ name: 'protected fields after mass assignment', row: row.rows[0] });
    const malicious = new URL(link); malicious.searchParams.set('callbackURL', 'https://attacker.invalid');
    const redirect = await auth.handler(new Request(malicious));
    results.push({ name: 'foreign callback URL rejected', status: redirect.status, redirectedToAttacker: (redirect.headers.get('location') ?? '').startsWith('https://attacker.invalid') });
  }
  originalLog(JSON.stringify(results, null, 2));
} finally {
  console.log = originalLog;
  client?.close();
  await rm(temp, { recursive: true, force: true });
}
