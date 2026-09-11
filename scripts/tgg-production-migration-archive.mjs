import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xsofowzvwetamhyuvlpj.supabase.co';
const BROKER_URL = `${SUPABASE_URL}/functions/v1/tgg-final-dashboard-pure-write`;
const OIDC_AUDIENCE = 'tgg-migration-archive';
const oidcRequestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const oidcRequestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
const historyDir = 'supabase/production-history';
const baselineDir = 'supabase/production-baseline';

if (!oidcRequestUrl || !oidcRequestToken) throw new Error('GitHub OIDC runtime unavailable.');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

let cachedOidc = null;
async function oidcToken() {
  if (cachedOidc) return cachedOidc;
  const sep = oidcRequestUrl.includes('?') ? '&' : '?';
  const r = await fetch(`${oidcRequestUrl}${sep}audience=${encodeURIComponent(OIDC_AUDIENCE)}`, {
    headers: { Authorization: `bearer ${oidcRequestToken}` },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.value) throw new Error(`OIDC token request failed (${r.status}).`);
  cachedOidc = String(d.value);
  return cachedOidc;
}

async function broker(operation, payload) {
  const r = await fetch(BROKER_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tgg-github-oidc': await oidcToken(),
    },
    body: JSON.stringify({ operation, ...payload }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) {
    throw new Error(`${operation} broker failed (${r.status}): ${d.error || d.detail || 'unknown error'}`);
  }
  return d.data;
}

async function exportMigrationChunk(afterVersion = null) {
  const data = await broker('export_migration_chunk', { after_version: afterVersion, limit: 20 });
  if (!data?.ok) throw new Error('Migration broker returned an invalid payload.');
  return data;
}

async function exportSchemaChunk(afterKey = 0) {
  const data = await broker('export_schema_chunk', { after_key: afterKey, limit: 50 });
  if (!Array.isArray(data)) throw new Error('Schema broker returned an invalid payload.');
  return data;
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
    if (re.test(text)) throw new Error(`Export stopped: ${name} literal detected.`);
  }
}

const migrations = [];
let after = null;
for (let page = 0; page < 500; page += 1) {
  const data = await exportMigrationChunk(after);
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

if (migrations.length < 1000) throw new Error(`Migration archive unexpectedly small: ${migrations.length}.`);
migrations.sort((a, b) => a.version.localeCompare(b.version));
for (let i = 1; i < migrations.length; i += 1) {
  if (migrations[i].version <= migrations[i - 1].version) throw new Error(`Migration ordering/duplicate failure near ${migrations[i].version}.`);
}

const allStatementText = migrations.flatMap((m) => m.statements).join('\n');
assertSafeText(allStatementText);
const ledgerText = migrations.map((m) => `${m.version}:${m.name}`).join('\n');
const statementsText = migrations.map((m) => `${m.version}:${m.name}:${m.statements.join('\n\n')}`).join('\n-- MIGRATION --\n');
const byDay = new Map();
for (const m of migrations) {
  const day = m.version.slice(0, 8);
  if (!byDay.has(day)) byDay.set(day, []);
  byDay.get(day).push(m);
}

await rm(historyDir, { recursive: true, force: true });
await mkdir(historyDir, { recursive: true });
for (const [day, rows] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const chunks = [
    '-- TRU GO GETTA production migration history archive',
    `-- Date bucket: ${day}`,
    '-- Historical evidence only. Do not replay against production.',
    '-- Preserve recorded order. Use the current schema baseline for clean bootstrap.',
    '',
  ];
  for (const m of rows) {
    chunks.push('-- ============================================================');
    chunks.push(`-- MIGRATION ${m.version} ${m.name || '(unnamed)'}`);
    if (m.created_by) chunks.push(`-- created_by: ${m.created_by}`);
    if (m.idempotency_key) chunks.push(`-- idempotency_key: ${m.idempotency_key}`);
    chunks.push(`-- statement_count: ${m.statements.length}`);
    chunks.push('');
    for (const statement of m.statements) {
      chunks.push(statement, '');
    }
  }
  const fileText = `${chunks.join('\n')}\n`;
  assertSafeText(fileText);
  await writeFile(join(historyDir, `${day}.sql`), fileText, 'utf8');
}

const historyManifest = {
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
    current_schema_baseline_required_for_clean_bootstrap: true,
  },
};
await writeFile(join(historyDir, 'manifest.json'), `${JSON.stringify(historyManifest, null, 2)}\n`, 'utf8');
await writeFile(join(historyDir, 'README.md'), `# TGG Production Migration History\n\nGenerated from the authoritative production \`supabase_migrations.schema_migrations\` ledger through a GitHub OIDC trust path. No static Supabase server secret is stored in GitHub.\n\nThese dated SQL files preserve historical evidence from the point migration tracking began. They are **not a from-zero bootstrap** because the first tracked migration already depended on pre-existing V54/V58 objects. Use \`../production-baseline/current-schema.sql\` for clean recovery and use this history for audit/reconciliation only. Never replay this history against production.\n`, 'utf8');

const schemaItems = [];
let afterKey = 0;
for (let page = 0; page < 500; page += 1) {
  const rows = await exportSchemaChunk(afterKey);
  if (!rows.length) break;
  for (const row of rows) {
    const key = Number(row.order_key);
    if (!Number.isSafeInteger(key) || key <= afterKey) throw new Error(`Schema ordering failure near ${row.object_key || 'unknown'}.`);
    const ddl = String(row.ddl || '');
    if (!ddl.trim()) throw new Error(`Empty DDL for ${row.object_key || key}.`);
    schemaItems.push({ order_key: key, kind: String(row.kind || ''), object_key: String(row.object_key || ''), ddl });
    afterKey = key;
  }
  if (rows.length < 50) break;
  if (page === 499) throw new Error('Schema pagination exceeded safety limit.');
}

if (schemaItems.length < 3000) throw new Error(`Schema baseline unexpectedly small: ${schemaItems.length} objects.`);
const schemaChunks = [
  '-- TRU GO GETTA current production schema baseline',
  '-- Schema-only recovery artifact. Contains no production row data.',
  '-- Generated through the repo-bound GitHub OIDC recovery path.',
  '-- Apply only to a fresh isolated Supabase-compatible database.',
  '',
];
const kindCounts = {};
for (const item of schemaItems) {
  kindCounts[item.kind] = (kindCounts[item.kind] || 0) + 1;
  schemaChunks.push(`-- [${item.order_key}] ${item.kind} ${item.object_key}`);
  schemaChunks.push(item.ddl, '');
}
const schemaText = `${schemaChunks.join('\n')}\n`;
assertSafeText(schemaText);

await rm(baselineDir, { recursive: true, force: true });
await mkdir(baselineDir, { recursive: true });
await writeFile(join(baselineDir, 'current-schema.sql'), schemaText, 'utf8');
const schemaManifest = {
  format: 'tgg-production-schema-baseline-v1',
  generated_at: new Date().toISOString(),
  source: 'PostgreSQL catalog DDL via service-only RPC and GitHub OIDC broker',
  item_count: schemaItems.length,
  kind_counts: kindCounts,
  schema_bytes: Buffer.byteLength(schemaText, 'utf8'),
  schema_sha256: sha256(schemaText),
  latest_migration_version: migrations.at(-1)?.version || null,
  safety: {
    schema_only: true,
    production_row_data_exported: false,
    oidc_only_export: true,
    high_risk_literal_scan_passed: true,
    production_apply_prohibited: true,
    clean_environment_replay_required: true,
  },
};
await writeFile(join(baselineDir, 'manifest.json'), `${JSON.stringify(schemaManifest, null, 2)}\n`, 'utf8');
await writeFile(join(baselineDir, 'README.md'), `# TGG Production Schema Baseline\n\n\`current-schema.sql\` is a schema-only recovery snapshot generated from PostgreSQL catalog definitions through the same strict GitHub OIDC path as the migration archive. It contains no production table rows.\n\nThis baseline exists because production migration tracking begins at V58.1 and therefore cannot recreate earlier V54/V58 bootstrap objects from the historical ledger alone. The baseline must pass the isolated replay/fingerprint gate before it is considered recovery-ready. Never apply it to production.\n`, 'utf8');

console.log(JSON.stringify({ history: historyManifest, baseline: schemaManifest }, null, 2));
