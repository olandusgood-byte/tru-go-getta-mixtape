import { access, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function integer(value, fallback = 2) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export function summarizeSourceReview({
  sourceAvailable,
  intakeCode = 2,
  xmlCode = 2,
  candidateCode = 2,
  candidateXmlCode = 2,
  candidateDecision = 'NOT_RUN',
  artifacts = []
}) {
  const reasons = [];
  if (!sourceAvailable) reasons.push('Canonical Blogger XML and companion SHA-256 are not present.');
  if (sourceAvailable && intakeCode !== 0) reasons.push('Canonical source identity or safety intake failed.');
  if (sourceAvailable && xmlCode !== 0) reasons.push('Canonical source XML validation failed.');
  if (sourceAvailable && candidateCode !== 0) reasons.push('Candidate generation or regression lint remains HOLD.');
  if (sourceAvailable && candidateXmlCode !== 0) reasons.push('Generated candidate XML validation failed or was not run.');
  if (sourceAvailable && candidateDecision !== 'READY_FOR_HUMAN_REVIEW') reasons.push('Candidate is not READY_FOR_HUMAN_REVIEW.');

  const ready = sourceAvailable
    && intakeCode === 0
    && xmlCode === 0
    && candidateCode === 0
    && candidateXmlCode === 0
    && candidateDecision === 'READY_FOR_HUMAN_REVIEW';

  return {
    schema: 'tgg-source-review-bundle-v1',
    version: 'V5740',
    generated_at: new Date().toISOString(),
    decision: ready ? 'READY_FOR_HUMAN_REVIEW' : 'HOLD',
    source_available: sourceAvailable === true,
    checks: {
      source_intake: intakeCode === 0 ? 'PASS' : sourceAvailable ? 'HOLD' : 'NOT_RUN',
      xml_wellformed: xmlCode === 0 ? 'PASS' : sourceAvailable ? 'HOLD' : 'NOT_RUN',
      candidate_xml_wellformed: candidateXmlCode === 0 ? 'PASS' : sourceAvailable ? 'HOLD' : 'NOT_RUN',
      candidate: candidateDecision
    },
    exit_codes: {
      source_intake: integer(intakeCode),
      xml_wellformed: integer(xmlCode),
      candidate_xml_wellformed: integer(candidateXmlCode),
      candidate: integer(candidateCode)
    },
    artifacts: [...artifacts].sort(),
    controls: {
      source_overwrite: false,
      production_writes: false,
      destructive_actions: false,
      auto_remediation: false,
      human_approval_required: true
    },
    reasons
  };
}

function option(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const output = option(args, '--output');
  if (!output) throw new Error('--output is required.');
  const available = option(args, '--source-available', 'false') === 'true';
  const candidateManifest = option(args, '--candidate-manifest');
  let candidateDecision = 'NOT_RUN';
  if (candidateManifest && await exists(candidateManifest)) {
    candidateDecision = JSON.parse(await readFile(candidateManifest, 'utf8')).decision || 'HOLD';
  }
  const artifactValues = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--artifact' && args[index + 1] && await exists(args[index + 1])) {
      artifactValues.push(args[index + 1]);
    }
  }
  const result = summarizeSourceReview({
    sourceAvailable: available,
    intakeCode: integer(option(args, '--intake-code')),
    xmlCode: integer(option(args, '--xml-code')),
    candidateCode: integer(option(args, '--candidate-code')),
    candidateXmlCode: integer(option(args, '--candidate-xml-code')),
    candidateDecision,
    artifacts: artifactValues
  });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
