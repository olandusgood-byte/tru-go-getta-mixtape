import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function count(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

export function lintBloggerSource(source) {
  const text = String(source || '');
  const errors = [];
  const warnings = [];

  if (/<script\b[^>]*>\s*<!\[CDATA\[/i.test(text)) {
    errors.push('Raw <![CDATA[ inside script must use a JavaScript-safe //<![CDATA[ wrapper.');
  }

  if (/\.from\(\s*['"]mixtapes['"]\s*\)[\s\S]{0,1800}?\.select\([\s\S]{0,1800}?artists/i.test(text)) {
    errors.push('Public discovery must not query mixtapes with a direct artists join.');
  }

  if (/<div\s+class=['"]shopprice['"]>\s*var\s+r\s*=\s*await\s+db\.rpc/i.test(text)) {
    errors.push('Creator Store contains the known shopprice/script-boundary corruption.');
  }

  const widget = text.match(/<b:widget\b[^>]*\bid=['"]HTML6['"][^>]*>/i);
  if (widget && !/\bcond=/.test(widget[0])) {
    errors.push('Homepage widget HTML6 must have a Blogger view condition.');
  }

  for (const id of ['tggAudio', 'tggNowPlaying', 'tggClosePlayer']) {
    const occurrences = count(text, new RegExp(`id=['"]${id}['"]`, 'g'));
    if (occurrences > 1) errors.push(`Duplicate DOM id ${id} appears ${occurrences} times.`);
  }

  if (/<strong\b[^>]*class=['"][^'"]*tgg-green[^'"]*['"][^>]*>\s*ONLINE\s*<\/strong>/i.test(text)) {
    warnings.push('Static ONLINE label found; bind it to verified runtime evidence.');
  }

  const scripts = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  for (const [index, script] of scripts.entries()) {
    const hasProtectedRpc = /\.rpc\(\s*['"]tgg_(?!public_)[^'"]+['"]/.test(script);
    if (hasProtectedRpc && !/\.auth\.getSession\s*\(/.test(script) && !/TGGAuthFirst\.protectedRpc\s*\(/.test(script)) {
      warnings.push(`Script ${index + 1} calls a protected RPC without an observable session gate.`);
    }
  }

  return {
    schema: 'tgg-blogger-predeploy-lint-v1',
    decision: errors.length ? 'HOLD' : 'PASS',
    errors,
    warnings
  };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('Usage: node scripts/tgg-predeploy-lint.mjs BLOGGER_SOURCE');
  const result = lintBloggerSource(await readFile(inputPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.decision === 'PASS' ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
