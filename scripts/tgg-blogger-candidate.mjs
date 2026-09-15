import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lintBloggerSource } from './tgg-predeploy-lint.mjs';

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function scopeHomepageWidgets(source) {
  let output = source;
  const scoped = [];
  let html6Found = false;
  for (const id of ['HTML4', 'HTML5', 'HTML6']) {
    const widgetPattern = new RegExp(`<b:widget\\b[^>]*\\bid=(['"])${id}\\1[^>]*>`, 'i');
    const match = output.match(widgetPattern);
    if (!match) continue;
    if (id === 'HTML6') html6Found = true;
    if (/\bcond=/.test(match[0])) continue;
    const replacement = match[0].replace(/<b:widget\b/, "<b:widget cond='data:view.isHomepage'");
    output = output.replace(match[0], replacement);
    scoped.push(id);
  }
  if (!html6Found) throw new Error('Required Blogger homepage widget HTML6 was not found.');
  return { source: output, scoped };
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
  if (!/<\/head\s*>/i.test(source)) throw new Error('Blogger source is missing </head>.');
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
    source: source.replace(/<\/head\s*>/i, () => `${blocks}\n</head>`),
    count: modules.length
  };
}

function repairLegacyPlayerIds(source) {
  const widgetPattern = /<b:widget\b[^>]*\bid=(['"])HTML4\1[^>]*>[\s\S]*?<\/b:widget>/i;
  const match = source.match(widgetPattern);
  if (!match) return { source, count: 0 };
  const replacements = new Map([
    ['tggAudio', 'tggLegacyAudio'],
    ['tggNowPlaying', 'tggLegacyNowPlaying'],
    ['tggClosePlayer', 'tggLegacyClosePlayer']
  ]);
  let widget = match[0];
  let count = 0;
  for (const [from, to] of replacements) {
    const pattern = new RegExp(`(['"])${from}\\1`, 'g');
    widget = widget.replace(pattern, (value, quote) => {
      count += 1;
      return `${quote}${to}${quote}`;
    });
  }
  return { source: source.replace(match[0], () => widget), count };
}

function replaceDirectDiscoveryQueries(source) {
  let output = source;
  let count = 0;

  output = output.replace(
    /const\s*\{\s*data,\s*error\s*\}\s*=\s*await\s+([A-Za-z_$][\w$]*)\s*\.from\(\s*['"]mixtapes['"]\s*\)\s*\.select\(\s*`[\s\S]*?artists\s*\([\s\S]*?`\s*\)([\s\S]*?)\.limit\(\s*(\d+)\s*\)\s*;/g,
    (_, client, tail, limit) => {
      count += 1;
      const featuredOnly = /\.eq\(\s*['"]featured['"]\s*,\s*true\s*\)/.test(tail);
      return `const { data, error } = await window.TGGPublicDiscovery.queryPublicReleases(${client}, ${limit}, null, { featuredOnly: ${featuredOnly} });`;
    }
  );

  output = output.replace(
    /const\s+result\s*=\s*await\s+([A-Za-z_$][\w$]*)\s*\.from\(\s*['"]mixtapes['"]\s*\)\s*\.select\(\s*`[\s\S]*?artists\s*\([\s\S]*?`\s*\)[\s\S]*?\.order\([\s\S]*?\)\s*;/g,
    (_, client) => {
      count += 1;
      return `const result = await window.TGGPublicDiscovery.queryPublicReleases(${client}, 10, null, { featuredOnly: false });`;
    }
  );

  output = output.replace(
    /([A-Za-z_$][\w$]*)\.from\(\s*['"]mixtapes['"]\s*\)\s*\.select\(\s*['"][^'"]*artists\([^'"]*['"]\s*\)[\s\S]*?\.then\(\s*/g,
    (_, client) => {
      count += 1;
      return `window.TGGPublicDiscovery.queryPublicReleases(${client}, 10, null, { featuredOnly: false }).then(`;
    }
  );

  return { source: output, count };
}

export function buildCandidate({ source, expectedSha256, modules = [] }) {
  const input = String(source || '');
  if (!/<html\b/i.test(input)) throw new Error('Input is not a Blogger HTML/XML document.');
  const sourceHash = sha256(input);
  if (!expectedSha256 || sourceHash !== expectedSha256) {
    throw new Error(`Source SHA-256 mismatch: expected ${expectedSha256 || '(missing)'}, received ${sourceHash}.`);
  }

  const scoped = scopeHomepageWidgets(input);
  const cdata = fixRawScriptCdata(scoped.source);
  const playerIds = repairLegacyPlayerIds(cdata.source);
  const discovery = replaceDirectDiscoveryQueries(playerIds.source);
  const injected = injectModules(discovery.source, modules);
  const lint = lintBloggerSource(injected.source);

  return {
    candidate: injected.source,
    manifest: {
      schema: 'tgg-blogger-candidate-manifest-v1',
      decision: lint.decision === 'PASS' ? 'READY_FOR_HUMAN_REVIEW' : 'HOLD',
      source_sha256: sourceHash,
      candidate_sha256: sha256(injected.source),
      changes: {
        homepage_widget_scoped: scoped.scoped.includes('HTML6'),
        homepage_widgets_scoped: scoped.scoped,
        raw_script_cdata_wrappers_fixed: cdata.count,
        legacy_player_id_references_renamed: playerIds.count,
        direct_discovery_queries_replaced: discovery.count,
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
