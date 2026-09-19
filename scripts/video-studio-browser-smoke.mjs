import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

const file=pathToFileURL(resolve('tgg-core/public/video-studio/index.html')).href;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const failures=[];
const check=(ok,msg)=>{if(!ok)failures.push(msg);};

try{
  await page.goto(file,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(300);

  check(await page.locator('#previewCanvas').count()===1,'preview canvas missing');
  check(await page.locator('#timelineViewport').count()===1,'timeline missing');
  check(await page.locator('.workspace-tabs [data-workspace="deliver"]').count()===1,'deliver workspace missing');

  await page.locator('[data-workspace="dashboard"]').click();
  check(await page.locator('#dashboardView:not(.view-hidden)').count()===1,'dashboard did not open');

  await page.locator('[data-workspace="edit"]').click();
  await page.locator('[data-panel="effects"]').click();
  await page.locator('#librarySearch').fill('Chroma Key');
  check(await page.getByText('Chroma Key',{exact:true}).count()>=1,'Chroma Key effect missing');

  await page.locator('[data-workspace="deliver"]').click();
  const renderText=await page.locator('#inspectorContent').innerText();
  check(renderText.includes('Production FFmpeg Pipeline'),'production render panel missing');

  await page.locator('#exportBtn').click();
  check(await page.getByText('Server FFmpeg Render',{exact:true}).count()===1,'server render export action missing');
  check(await page.locator('.render-presets [data-preset="1080p"]').count()===1,'1080p preset missing');

  const source=await page.locator('script[src*="app.js"]').getAttribute('src');
  check(Boolean(source),'editor app script missing');
  const appSource=await readFile(resolve('tgg-core/public/video-studio/app.js'),'utf8');
  check(appSource.includes('toggleKeyframe'),'keyframe engine missing');
  check(appSource.includes('data-trim="left"'),'trim handle renderer missing');
  check(appSource.includes('data-fx-amount'),'effect amount control missing');
  check(appSource.includes('titleStyleFor'),'title designer engine missing');
  check(appSource.includes('data-transition-duration'),'transition duration control missing');
  check(appSource.includes('transitionOut'),'out transition engine missing');
  check(appSource.includes('function drawScopes'),'live scope engine missing');

  await page.screenshot({path:'video-studio-smoke.png',fullPage:true});
  if(failures.length)throw new Error(failures.join('; '));
  console.log(JSON.stringify({ok:true,url:file,checks:14}));
} finally {
  await browser.close();
}
