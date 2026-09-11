import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xsofowzvwetamhyuvlpj.supabase.co';
const BROKER_URL = `${SUPABASE_URL}/functions/v1/tgg-final-dashboard-pure-write`;
const OIDC_AUDIENCE = 'tgg-migration-archive';
const oidcRequestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const oidcRequestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const outDir = 'supabase/production-history';

if (!oidcRequestUrl || !oidcRequestToken) throw new Error('GitHub OIDC runtime unavailable.');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function oidcToken() {
  const sep = oidcRequestUrl.includes('?') ? '&' : '?';
  const r = await fetch(`${oidcRequestUrl}${sep}audience=${encodeURIComponent(OIDC_AUDIENCE)}`, {
    headers: { Authorization: `bearer ${oidcRequestToken}` },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.value) throw new Error(`OIDC token request failed (${r.status}).`);
  return String(d.value);
}

async function exportChunk(afterVersion = null) {
  const r = await fetch(BROKER_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tgg-github-oidc': await oidcToken(),
    },
    body: JSON.stringify({
      operation: 'export_migration_chunk',
      after_version: afterVersion,
      limit: 20,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok || !d.data?.ok) {
    throw new Error(`Migration broker failed (${r.status}): ${d.error || d.detail || 'unknown error'}`);
  }
  return d.data;
}

function assertSafeText(text) {
  const patterns = [
    ['Stripe live key', /sk_live_[A-Za-z0-9]/],
    ['Stripe webhook secret', /whsec_[A-Za-z0-9]/],
    ['Supabase secret key', /sb_secret_[A-Za-z0-9]/],
    ['AWS access key', /AKIA[0-9A-Z]{16}/],
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['JWT literal', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ];
  for (const [name, re] of patterns) {
    if (re.test(text)) throw new Error(`Archive stopped: ${name} literal detected.`);
  }
}

const migrations = [];
let after = null;
for (let page = 0; page < 500; page += 1) {
  const data = await exportChunk(after);
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (!rows.length) {
    if (data.has_more) throw new Error('Broker returned has_more=true with no rows.');
    break;
  }
  for (const row of rows) {
    const version = String(row.version || '');
    if (!/^\d{14}$/.test(version)) throw new Error(`Invalid migration version: ${version}`);
    const statements = Array.isArray(row.statements) ? row.statements.map(String) : [];
    migrations.push({
      version,
      name: row.name == null ? '' : String(row.name),
      statements,
      created_by: row.created_by == null ? null : String(row.created_by),
      idempotency_key: row.idempotency_key == null ? null : String(row.idempotency_key),
      rollback: Array.isArray(row.rollback) ? row.rollback.map(String) : [],
    });
  }
  const nextAfter = String(data.next_after || '');
  if (!/^\d{14}$/.test(nextAfter)) throw new Error(`Invalid next_after: ${nextAfter}`);
  if (after && nextAfter <= after) throw new Error('Migration pagination did not advance.');
  after = nextAfter;
  if (!data.has_more) break;
  if (page === 499) throw new Error('Migration pagination exceeded safety limit.');
}

if (migrations.length < 1000) {
  throw new Error(`Migration archive unexpectedly small: ${migrations.length}.`);
}

migrations.sort((a, b) => a.version.localeCompare(b.version));
for (let i = 1; i < migrations.length; i += 1) {
  if (migrations[i].version <= migrations[i - 1].version) {
    throw new Error(`Migration ordering/duplicate failure near ${migrations[i].version}.`);
  }
}

const allStatementText = migrations.flatMap((m) => m.statements).join('\n');
assertSafeText(allStatementText);

const ledgerText = migrations.map((m) => `${m.version}:${m.name}`).join('\n');
const statementsText = migrations
  .map((m) => `${m.version}:${m.name}:${m.statements.join('\n\n')}`)
  .join('\n-- MIGRATION --\n');

const byDay = new Map();
for (const m of migrations) {
  const day = m.version.slice(0, 8);
  if (!byDay.has(day)) byDay.set(day, []);
  byDay.get(day).push(m);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const [day, rows] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const chunks = [
    '-- TRU GO GETTA production migration history archive',
    `-- Date bucket: ${day}`,
    '-- Historical evidence only. Do not replay against production.',
    '-- Preserve the recorded order. Validate in an isolated clean environment before any bootstrap use.',
    '',
  ];
  for (const m of rows) {
    chunks.push(`-- ============================================================`);
    chunks.push(`-- MIGRATION ${m.version} ${m.name || '(unnamed)'}`);
    if (m.created_by) chunks.push(`-- created_by: ${m.created_by}`);
    if (m.idempotency_key) chunks.push(`-- idempotency_key: ${m.idempotency_key}`);
    chunks.push(`-- statement_count: ${m.statements.length}`);
    chunks.push('');
    for (const statement of m.statements) {
      chunks.push(statement);
      chunks.push('');
    }
  }
  const fileText = `${chunks.join('\n')}\n`;
  assertSafeText(fileText);
  await writeFile(join(outDir, `${day}.sql`), fileText, 'utf8');
}

const manifest = {
  format: 'tgg-production-migration-history-v1',
  generated_at: new Date().toISOString(),
  source: 'supabase_migrations.schema_migrations via GitHub OIDC broker',
  migration_count: migrations.length,
  first_version: migrations[0]?.version || null,
  latest_version: migrations.at(-1)?.version || null,
  date_files: [...byDay.keys()].sort().map((day) => `${day}.sql`),
  statement_bytes: Buffer.byteLength(allStatementText, 'utf8'),
  ledger_sha256: sha256(ledgerText),
  statements_sha256: sha256(statementsText),
  rollback_entries: migrations.filter((m) => m.rollback.length > 0).length,
  safety: {
    oidc_only_export: true,
    high_risk_literal_scan_passed: true,
    direct_production_replay_prohibited: true,
    clean_environment_validation_required: true,
  },
};

await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(
  join(outDir, 'README.md'),
  `# TGG Production Migration History\n\nThis directory is generated from the authoritative production \`supabase_migrations.schema_migrations\` ledger through a short-lived GitHub OIDC trust path. No static Supabase server secret is stored in GitHub.\n\nThe SQL files are grouped by migration date and preserve migration order and statement text for recovery review. They are **historical evidence, not a production replay script**. Never apply them back to production. Before using them to bootstrap a clean database, validate the complete sequence in an isolated environment and compare the resulting schema against the production schema fingerprint.\n\nSee \`manifest.json\` for migration count and SHA-256 digests.\n`,
  'utf8',
);

console.log(JSON.stringify(manifest, null, 2));
