import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function parseChecksumFile(text) {
  const match = String(text || '').trim().match(/^([a-f0-9]{64})\s+\*?([^\r\n]+)$/i);
  if (!match) throw new Error('Checksum file must contain: <64-char SHA-256>  <filename>.');
  return { sha256: match[1].toLowerCase(), filename: match[2].trim() };
}

export function evaluateSourceIntake({
  content,
  expectedSha256,
  expectedFilename,
  actualFilename,
  minBytes = 650000,
  maxBytes = 2000000
}) {
  const source = String(content || '');
  const bytes = Buffer.byteLength(source, 'utf8');
  const actualSha256 = sha256(source);
  const reasons = [];

  if (!/\.xml$/i.test(actualFilename || '')) reasons.push('Canonical source filename must end in .xml.');
  if (expectedFilename !== actualFilename) reasons.push('Checksum filename does not match the submitted source filename.');
  if (expectedSha256 !== actualSha256) reasons.push('Submitted source does not match its companion SHA-256.');
  if (bytes < minBytes) reasons.push(`Source is smaller than the ${minBytes}-byte canonical-source floor.`);
  if (bytes > maxBytes) reasons.push(`Source exceeds the ${maxBytes}-byte canonical-source ceiling.`);

  const requiredMarkers = [
    ['Blogger html root', /<html\b/i],
    ['Blogger namespace', /xmlns:b\s*=/i],
    ['Blogger skin', /<b:skin\b/i],
    ['homepage widget HTML6', /<b:widget\b[^>]*\bid=(['"])HTML6\1/i],
    ['closing html tag', /<\/html\s*>/i]
  ];
  for (const [label, pattern] of requiredMarkers) {
    if (!pattern.test(source)) reasons.push(`Missing required ${label} marker.`);
  }

  const forbiddenSecrets = [
    ['Supabase service-role secret', /service[_-]?role/i],
    ['Stripe live secret key', /sk_live_[A-Za-z0-9]+/],
    ['private key material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/]
  ];
  for (const [label, pattern] of forbiddenSecrets) {
    if (pattern.test(source)) reasons.push(`Canonical source contains forbidden ${label}.`);
  }

  return {
    schema: 'tgg-canonical-source-intake-v1',
    decision: reasons.length ? 'HOLD' : 'ACCEPTED_FOR_CANDIDATE',
    filename: actualFilename,
    bytes,
    sha256: actualSha256,
    expected_sha256: expectedSha256,
    source_constraints: { min_bytes: minBytes, max_bytes: maxBytes },
    controls: {
      production_write: false,
      source_modified: false,
      destructive_action: false,
      auto_remediation: false
    },
    reasons
  };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const sourcePath = args[0];
  const checksumPath = args[1];
  const manifestPath = option(args, '--manifest');
  if (!sourcePath || !checksumPath) {
    throw new Error('Usage: node scripts/tgg-source-intake.mjs SOURCE.xml SOURCE.xml.sha256 [--manifest OUTPUT.json]');
  }

  const content = await readFile(sourcePath, 'utf8');
  const checksum = parseChecksumFile(await readFile(checksumPath, 'utf8'));
  const result = evaluateSourceIntake({
    content,
    expectedSha256: checksum.sha256,
    expectedFilename: checksum.filename,
    actualFilename: basename(sourcePath)
  });
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (manifestPath) await writeFile(manifestPath, output, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(output);
  process.exitCode = result.decision === 'ACCEPTED_FOR_CANDIDATE' ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
