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
    check('title',page.title()=='TRU GO GETTA — Game V1.32 3D',page.title())
    check('three-local',page.evaluate("window.THREE.REVISION")=='152')
    page.click('#newGame'); page.fill('#stageName','Tony Snow'); page.select_option('#styleChoice',label='Rapper'); page.click('#startGame')
    page.wait_for_timeout(180)

    check('street-life-api',page.evaluate("!!window.TGGStreetLife && window.TGGStreetLife.CONTACTS.length>=6"))
    check('pedestrian-population',page.evaluate("window.TGG3D.pedestrians.length")>=6)
    check('traffic-population',page.evaluate("window.TGG3D.traffic.length")>=6)
    check('street-prompt-host',page.locator('#streetLifePrompt').count()==1)
    check('street-dialogue-host',page.locator('#streetDialogue').count()==1)
    check('street-event-api',page.evaluate("!!window.TGGStreetEvents && window.TGGStreetEvents.HOTSPOTS.length===3"))
    check('street-event-hud-hosts',page.locator('#streetEventPrompt').count()==1 and page.locator('#streetEventHud').count()==1)

    # Move to the Downtown Cypher hotspot and verify a 3D crowd gathers with no economy mutation.
    page.evaluate("""() => {
      const e=window.TGGStreetEvents.get('downtown-cypher');
      const s=window.TGGGame.getState();
      s.inVehicle=false;
      s.x=e.x/.92+50;
      s.y=e.z/.92+50;
      window.TGGGame.refresh();
    }""")
    page.wait_for_timeout(140)
    near_event=page.evaluate("window.TGGStreetEvents.nearest()")
    check('street-event-proximity',near_event is not None and near_event.get('event',{}).get('id')=='downtown-cypher',json.dumps(near_event))
    check('street-event-prompt-visible',page.locator('#streetEventPrompt').is_visible() and 'DOWNTOWN CYPHER' in page.locator('#streetEventPrompt').inner_text(),page.locator('#streetEventPrompt').inner_text())
    before_event=page.evaluate("({cash:window.TGGGame.getState().cash,xp:window.TGGGame.getState().xp})")
    started=page.evaluate("window.TGGStreetEvents.startNearest()")
    page.wait_for_timeout(240)
    active_event=page.evaluate("window.TGGStreetEvents.status()")
    crowd_flags=page.evaluate("window.TGG3D.pedestrians.filter(x=>x.userData.streetEventMode).length")
    check('street-event-start',started.get('ok') is True and active_event.get('active',{}).get('id')=='downtown-cypher',json.dumps([started,active_event]))
    check('crowd-gather-3d',crowd_flags>=3,str(crowd_flags))
    hud_state=page.evaluate("""() => {
      const e=document.getElementById('streetEventHud');
      const cs=getComputedStyle(e);
      return {show:e.classList.contains('show'),aria:e.getAttribute('aria-hidden'),visibility:cs.visibility,display:cs.display,text:e.textContent||''};
    }""")
    check('street-event-live-hud',hud_state.get('show') is True and hud_state.get('aria')=='false' and hud_state.get('visibility')!='hidden' and hud_state.get('display')!='none' and 'DOWNTOWN CYPHER' in hud_state.get('text','').upper(),json.dumps(hud_state))
    finished=page.evaluate("window.TGGStreetEvents.finish()")
    page.wait_for_timeout(100)
    after_event=page.evaluate("({cash:window.TGGGame.getState().cash,xp:window.TGGGame.getState().xp,state:window.TGGStreetEvents.status(),crowd:window.TGG3D.pedestrians.filter(x=>x.userData.streetEventMode).length})")
    check('street-event-complete',finished.get('ok') is True and 'downtown-cypher' in after_event['state'].get('completed',[]),json.dumps([finished,after_event]))
    check('crowd-release',after_event['crowd']==0,json.dumps(after_event))
    check('street-event-no-reward',after_event['cash']==before_event['cash'] and after_event['xp']==before_event['xp'],json.dumps([before_event,after_event]))
    stored_events=page.evaluate("JSON.parse(localStorage.getItem('tgg-street-events-v1')||'{}')")
    check('street-event-save','downtown-cypher' in stored_events.get('completed',[]) and stored_events.get('crowdHype',0)>0,json.dumps(stored_events))

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

    # Pin one ambient vehicle to the player's current world position inside a single JS task.
    traffic_probe=page.evaluate("""() => {
      const s=window.TGGGame.getState();
      s.inVehicle=true;
      window.TGGGame.refresh();
      const px=((Number(s.x)||50)-50)*.92;
      const pz=((Number(s.y)||50)-50)*.92;
      const v=window.TGG3D.traffic[0];
      v.position.set(px,0,pz);
      const near=window.TGGStreetLife.nearestTraffic(7);
      window.TGGStreetLife.render();
      return {near,prompt:document.getElementById('streetLifePrompt')?.textContent||''};
    }""")
    traffic_near=traffic_probe.get('near')
    check('traffic-proximity',traffic_near is not None and traffic_near.get('distance',99)<=7,json.dumps(traffic_probe))
    check('contextual-traffic-hud','TRAFFIC' in traffic_probe.get('prompt',''),traffic_probe.get('prompt',''))

    cash_before=page.evaluate("window.TGGGame.getState().cash")
    horn_probe=page.evaluate("""() => {
      const s=window.TGGGame.getState();
      const px=((Number(s.x)||50)-50)*.92;
      const pz=((Number(s.y)||50)-50)*.92;
      window.TGG3D.traffic[0].position.set(px,0,pz);
      const horned=window.TGGStreetLife.onHorn();
      return {horned,state:window.TGGStreetLife.snapshot().lastHornReaction};
    }""")
    horned=horn_probe.get('horned')
    horn_state=horn_probe.get('state')
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
