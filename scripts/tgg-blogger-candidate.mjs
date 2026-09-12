import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lintBloggerSource } from './tgg-predeploy-lint.mjs';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function scopeHomepageWidget(source) {
  const widgetPattern = /<b:widget\b[^>]*\bid=(['"])HTML6\1[^>]*>/i;
  const match = source.match(widgetPattern);
  if (!match) throw new Error('Required Blogger homepage widget HTML6 was not found.');
  if (/\bcond=/.test(match[0])) return { source, changed: false };
  const replacement = match[0].replace(/<b:widget\b/, "<b:widget cond='data:view.isHomepage'");
  return { source: source.replace(match[0], replacement), changed: true };
}

function fixRawScriptCdata(source) {
  let count = 0;
  const transformed = source.replace(/(<script\b[^>]*>)\s*<!\[CDATA\[/gi, (_, opening) => {
    count += 1;
    return `${opening}\n//<![CDATA[`;
  });
  return { source: transformed, count };
}

function injectModules(source, modules) {
  if (!/<\/body\s*>/i.test(source)) throw new Error('Blogger source is missing </body>.');
  if (!modules.length) return { source, count: 0 };

  const blocks = modules.map(({ path, content }) => {
    if (content.includes('</script>')) throw new Error(`${path}: module contains a literal </script> boundary.`);
    return [
      `<!-- V5680 review module: ${path} -->`,
      "<script type='text/javascript'>",
      '//<![CDATA[',
      content.trim(),
      '//]]>',
      '</script>'
    ].join('\n');
  }).join('\n');

  return {
    source: source.replace(/<\/body\s*>/i, `${blocks}\n</body>`),
    count: modules.length
  };
}

export function buildCandidate({ source, expectedSha256, modules = [] }) {
  const input = String(source || '');
  if (!/<html\b/i.test(input)) throw new Error('Input is not a Blogger HTML/XML document.');
  const sourceHash = sha256(input);
  if (!expectedSha256 || sourceHash !== expectedSha256) {
    throw new Error(`Source SHA-256 mismatch: expected ${expectedSha256 || '(missing)'}, received ${sourceHash}.`);
  }

  const scoped = scopeHomepageWidget(input);
  const cdata = fixRawScriptCdata(scoped.source);
  const injected = injectModules(cdata.source, modules);
  const lint = lintBloggerSource(injected.source);

  return {
    candidate: injected.source,
    manifest: {
      schema: 'tgg-blogger-candidate-manifest-v1',
      decision: lint.decision === 'PASS' ? 'READY_FOR_HUMAN_REVIEW' : 'HOLD',
      source_sha256: sourceHash,
      candidate_sha256: sha256(injected.source),
      changes: {
        homepage_widget_scoped: scoped.changed,
        raw_script_cdata_wrappers_fixed: cdata.count,
        review_modules_injected: injected.count,
        module_paths: modules.map((module) => module.path)
      },
      lint,
      controls: {
        overwrote_source: false,
        production_write: false,
        destructive_action: false,
        auto_remediation: false,
        human_approval_required: true
      }
    }
  };
}

function optionValues(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]);
  }
  return values;
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
  const sourcePath = args[0];
  const outputPath = args[1];
  const manifestPath = optionValues(args, '--manifest')[0];
  const expectedSha256 = optionValues(args, '--expected-sha256')[0];
  const modulePaths = optionValues(args, '--module');

  if (!sourcePath || !outputPath || !manifestPath || !expectedSha256) {
    throw new Error('Usage: node scripts/tgg-blogger-candidate.mjs SOURCE.xml OUTPUT.xml --manifest MANIFEST.json --expected-sha256 HASH [--module FILE.js ...]');
  }
  if (resolve(sourcePath) === resolve(outputPath)) throw new Error('Output must not overwrite the source file.');
  if (await exists(outputPath) || await exists(manifestPath)) {
    throw new Error('Output or manifest already exists; refusing to overwrite it.');
  }

  const source = await readFile(sourcePath, 'utf8');
  const modules = [];
  for (const path of modulePaths) modules.push({ path, content: await readFile(path, 'utf8') });
  const result = buildCandidate({ source, expectedSha256, modules });
  await writeFile(outputPath, result.candidate, { encoding: 'utf8', flag: 'wx' });
  await writeFile(manifestPath, `${JSON.stringify(result.manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
  process.exitCode = result.manifest.decision === 'READY_FOR_HUMAN_REVIEW' ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
