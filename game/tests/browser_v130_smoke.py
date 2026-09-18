import json,subprocess,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen([sys.executable,'-m','http.server','8767','--bind','127.0.0.1'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]; errors=[]
def check(name,ok,detail=''): results.append({'name':name,'ok':bool(ok),'detail':detail})

try:
  time.sleep(.8)
  with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'])
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.on('console',lambda m: errors.append('console:'+m.text) if m.type=='error' else None)
    page.on('pageerror',lambda e: errors.append('pageerror:'+str(e)))
    page.goto('http://127.0.0.1:8767/index.html',wait_until='load')
    page.wait_for_function("window.TGG3D && window.TGG3D.isReady()",timeout=30000)
    check('title',page.title()=='TRU GO GETTA — Game V1.30 3D',page.title())
    check('three-local',page.evaluate("window.THREE.REVISION")=='152')
    page.click('#newGame'); page.fill('#stageName','Tony Snow'); page.select_option('#styleChoice',label='Rapper'); page.click('#startGame')
    check('city-canvas',page.locator('#city3d canvas').count()==1)

    page.wait_for_function("window.TGGInteriors3D && window.TGGInteriors3D.isReady()",timeout=15000)
    check('four-interiors',page.evaluate("window.TGGInteriors3D.runtimes.length")==4)
    for screen,host in [('home','home3d'),('media','media3d'),('shops','shops3d'),('park','park3d')]:
      page.evaluate("(s)=>window.TGGGame.show(s)",screen); page.wait_for_timeout(120)
      check(screen+'-3d',page.locator('#'+host+' canvas').count()==1)
      page.evaluate("window.TGGGame.show('game')")

    page.evaluate("window.TGGGame.show('garage')"); page.wait_for_timeout(120)
    check('garage-3d',page.evaluate("!!window.TGGGarage3D && window.TGGGarage3D.isReady()"))
    page.evaluate("window.TGGGame.show('studio')"); page.wait_for_timeout(120)
    check('studio-3d',page.evaluate("!!window.TGGStudio3D && window.TGGStudio3D.isReady()"))
    page.evaluate("window.TGGGame.show('game')")

    page.wait_for_timeout(120)
    check('nav-hud','active' in (page.locator('#navHud').get_attribute('class') or ''))
    page.evaluate("()=>{const s=window.TGGGame.getState();s.x=72;s.y=36;s.accepted=true;window.TGGGame.refresh()}")
    page.wait_for_timeout(120)
    check('mission-nav',page.locator('#navLabel').inner_text()=='MISSION',page.locator('#navLabel').inner_text())

    check('traffic-count',page.evaluate("window.TGG3D.traffic.length")>=6)
    before=page.evaluate("window.TGG3D.traffic.map(v=>[v.position.x,v.position.z])")
    page.wait_for_timeout(600)
    after=page.evaluate("window.TGG3D.traffic.map(v=>[v.position.x,v.position.z])")
    check('traffic-moves',before!=after,json.dumps([before,after]))
    check('pedestrians',page.evaluate("window.TGG3D.pedestrians.length")>=6)
    check('mission-preserved',page.locator('#missionBtn').count()==1)
    check('save-preserved',page.locator('#saveBtn').count()==1)
    check('no-runtime-errors',not errors,'; '.join(errors))
    browser.close()
finally:
  server.terminate()
  try: server.wait(timeout=3)
  except: server.kill()

failed=[x for x in results if not x['ok']]
print(json.dumps({'passed':len(results)-len(failed),'failed':len(failed),'results':results,'errors':errors},indent=2))
if failed: sys.exit(1)
