import { chromium } from 'playwright';

const target='https://trugogettamixtapes.blogspot.com/p/video-studio.html';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const consoleErrors=[];
page.on('console',m=>{ if(m.type()==='error') consoleErrors.push(m.text()); });

try{
  const response=await page.goto(target,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(2500);
  const finalUrl=page.url();
  const title=await page.title();
  const body=(await page.locator('body').innerText().catch(()=>'' )).replace(/\s+/g,' ').trim();
  const html=await page.content();
  const report={
    ok:Boolean(response&&response.ok()),
    status:response?response.status():null,
    finalUrl,
    title,
    hasStandaloneTarget:html.includes('tgg-core.onrender.com/video-studio'),
    hasOldCssLeak:/--tgg-muted|--tgg-red|#tgg-video-final/.test(body),
    mentionsVideoStudio:/Video Studio/i.test(body),
    bodyPreview:body.slice(0,1200),
    consoleErrors:consoleErrors.slice(0,8)
  };
  console.log('BLOGGER_VIDEO_STUDIO_PROBE='+JSON.stringify(report));
}finally{
  await browser.close();
}
