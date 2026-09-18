import json,subprocess,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen([sys.executable,'-m','http.server','8768','--bind','127.0.0.1'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]; errors=[]
def check(name,ok,detail=''): results.append({'name':name,'ok':bool(ok),'detail':detail})

try:
  time.sleep(.8)
  with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'])
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.on('console',lambda m: errors.append('console:'+m.text) if m.type=='error' else None)
    page.on('pageerror',lambda e: errors.append('pageerror:'+str(e)))
    page.goto('http://127.0.0.1:8768/index.html',wait_until='load')
    page.wait_for_function("window.TGG3D && window.TGG3D.isReady()",timeout=30000)
    check('title',page.title()=='TRU GO GETTA — Game V1.31 3D',page.title())
    check('three-local',page.evaluate("window.THREE.REVISION")=='152')
    page.click('#newGame'); page.fill('#stageName','Tony Snow'); page.select_option('#styleChoice',label='Rapper'); page.click('#startGame')
    page.wait_for_timeout(180)

    check('street-life-api',page.evaluate("!!window.TGGStreetLife && window.TGGStreetLife.CONTACTS.length>=6"))
    check('pedestrian-population',page.evaluate("window.TGG3D.pedestrians.length")>=6)
    check('traffic-population',page.evaluate("window.TGG3D.traffic.length")>=6)
    check('street-prompt-host',page.locator('#streetLifePrompt').count()==1)
    check('street-dialogue-host',page.locator('#streetDialogue').count()==1)

    # Put player on top of a moving pedestrian and verify a talk is contextual + reward-free.
    ped=page.evaluate("""() => {
      const h=window.TGG3D.pedestrians[0];
      return {x:h.position.x,z:h.position.z};
    }""")
    page.evaluate("""p => {
      const s=window.TGGGame.getState();
      s.inVehicle=false;
      s.x=p.x/.92+50;
      s.y=p.z/.92+50;
      window.TGGGame.refresh();
    }""",ped)
    page.wait_for_timeout(120)
    near=page.evaluate("window.TGGStreetLife.nearestPedestrian()")
    check('pedestrian-proximity',near is not None and near.get('distance',99)<=3.4,json.dumps(near))
    before=page.evaluate("({cash:window.TGGGame.getState().cash,xp:window.TGGGame.getState().xp,talks:window.TGGStreetLife.snapshot().talks})")
    result=page.evaluate("window.TGGStreetLife.activateNearest()")
    after=page.evaluate("({cash:window.TGGGame.getState().cash,xp:window.TGGGame.getState().xp,talks:window.TGGStreetLife.snapshot().talks,met:window.TGGStreetLife.snapshot().met})")
    check('street-talk-recorded',result.get('ok') is True and after['talks']==before['talks']+1,json.dumps([before,result,after]))
    check('street-talk-persistent',len(after.get('met',[]))>=1,json.dumps(after))
    check('street-talk-no-reward',after['cash']==before['cash'] and after['xp']==before['xp'],json.dumps([before,after]))
    stored=page.evaluate("JSON.parse(localStorage.getItem('tgg-street-life-v1')||'{}')")
    check('street-life-save',stored.get('talks',0)>=1 and len(stored.get('met',[]))>=1,json.dumps(stored))

    # Move into a car beside ambient traffic and verify contextual traffic HUD.
    traffic=page.evaluate("""() => {
      const v=window.TGG3D.traffic[0];
      return {x:v.position.x,z:v.position.z};
    }""")
    page.evaluate("""p => {
      const s=window.TGGGame.getState();
      s.inVehicle=true;
      s.x=p.x/.92+50;
      s.y=p.z/.92+50;
      window.TGGGame.refresh();
    }""",traffic)
    page.wait_for_timeout(100)
    traffic_near=page.evaluate("window.TGGStreetLife.nearestTraffic(7)")
    check('traffic-proximity',traffic_near is not None and traffic_near.get('distance',99)<=7,json.dumps(traffic_near))
    page.evaluate("window.TGGStreetLife.render()")
    prompt=page.locator('#streetLifePrompt').inner_text()
    check('contextual-traffic-hud','TRAFFIC' in prompt,prompt)

    cash_before=page.evaluate("window.TGGGame.getState().cash")
    horned=page.evaluate("window.TGGStreetLife.onHorn()")
    horn_state=page.evaluate("window.TGGStreetLife.snapshot().lastHornReaction")
    cash_after=page.evaluate("window.TGGGame.getState().cash")
    check('horn-reaction',horned is True and horn_state is not None,json.dumps(horn_state))
    check('horn-no-reward',cash_after==cash_before,f'{cash_before}->{cash_after}')

    qa=page.evaluate("window.TGGQA.run()")
    rqa=page.evaluate("window.TGGReleaseQA.run()")
    check('runtime-qa',qa.get('passed') is True,json.dumps([x for x in qa.get('report',[]) if x.get('status')!='PASS']))
    check('release-qa',rqa.get('passed') is True,json.dumps([x for x in rqa.get('checks',[]) if not x.get('pass')]))
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
