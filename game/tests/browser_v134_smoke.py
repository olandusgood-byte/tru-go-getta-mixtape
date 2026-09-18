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
    check('title',page.title()=='TRU GO GETTA — Game V1.34 3D',page.title())
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
    check('street-event-prompt-visible',page.locator('#streetEventPrompt').is_visible() and 'OPEN CIRCLE' in page.locator('#streetEventPrompt').inner_text(),page.locator('#streetEventPrompt').inner_text())
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
    check('street-event-live-hud',hud_state.get('show') is True and hud_state.get('aria')=='false' and hud_state.get('visibility')!='hidden' and hud_state.get('display')!='none' and 'OPEN CIRCLE' in hud_state.get('text','').upper(),json.dumps(hud_state))
    finished=page.evaluate("window.TGGStreetEvents.finish()")
    page.wait_for_timeout(100)
    after_event=page.evaluate("({cash:window.TGGGame.getState().cash,xp:window.TGGGame.getState().xp,state:window.TGGStreetEvents.status(),crowd:window.TGG3D.pedestrians.filter(x=>x.userData.streetEventMode).length})")
    check('street-event-complete',finished.get('ok') is True and 'downtown-cypher' in after_event['state'].get('completed',[]),json.dumps([finished,after_event]))
    check('crowd-release',after_event['crowd']==0,json.dumps(after_event))
    check('street-event-no-reward',after_event['cash']==before_event['cash'] and after_event['xp']==before_event['xp'],json.dumps([before_event,after_event]))
    stored_events=page.evaluate("JSON.parse(localStorage.getItem('tgg-street-events-v1')||'{}')")
    check('street-event-save','downtown-cypher' in stored_events.get('completed',[]) and stored_events.get('crowdHype',0)>0,json.dumps(stored_events))
    first_profile=page.evaluate("window.TGGStreetEvents.streetProfile()")
    first_variant=page.evaluate("window.TGGStreetEvents.variant('downtown-cypher')")
    check('street-rep-first-run',first_profile.get('reputation',0)>0 and first_profile.get('rank')=='ON THE RADAR',json.dumps(first_profile))
    check('street-variant-first-run',first_variant.get('name')=='OPEN CIRCLE' and first_variant.get('cosmeticOnly') is True and first_variant.get('rewardMultiplier')==1,json.dumps(first_variant))

    second_start=page.evaluate("window.TGGStreetEvents.start('downtown-cypher')")
    second_finish=page.evaluate("window.TGGStreetEvents.finish()")
    check('street-second-run',second_start.get('ok') is True and second_finish.get('ok') is True,json.dumps([second_start,second_finish]))
    third_variant=page.evaluate("window.TGGStreetEvents.variant('downtown-cypher')")
    check('street-variant-upgrade',third_variant.get('name')=='LOCAL BUZZ CYPHER' and third_variant.get('runs')==2,json.dumps(third_variant))
    third_start=page.evaluate("window.TGGStreetEvents.start('downtown-cypher')")
    third_finish=page.evaluate("window.TGGStreetEvents.finish()")
    profile3=page.evaluate("window.TGGStreetEvents.streetProfile()")
    check('street-third-run',third_start.get('ok') is True and third_finish.get('ok') is True,json.dumps([third_start,third_finish]))
    check('street-rank-local-name',profile3.get('reputation',0)>=30 and profile3.get('rank')=='LOCAL NAME',json.dumps(profile3))
    unlocks3=page.evaluate("window.TGGProgression.sync().unlocked")
    check('street-known-achievement','street-known' in unlocks3,json.dumps(unlocks3))
    after_three=page.evaluate("({cash:window.TGGGame.getState().cash,xp:window.TGGGame.getState().xp})")
    check('street-reputation-no-reward',after_three==before_event,json.dumps([before_event,after_three]))

    check('street-sets-api',page.evaluate("!!window.TGGStreetSets && window.TGGStreetSets.SETS.length===3"))
    check('street-set-hud',page.locator('#streetSetHud').count()==1)
    set_start=page.evaluate("window.TGGStreetSets.start('block-to-studio')")
    check('street-set-start',set_start.get('active')=='block-to-studio' and set_start.get('expected')=='downtown-cypher',json.dumps(set_start))

    page.evaluate("""() => {
      const e=window.TGGStreetEvents.get('downtown-cypher');const s=window.TGGGame.getState();
      s.inVehicle=false;s.x=e.x/.92+50;s.y=e.z/.92+50;window.TGGGame.refresh();
    }""")
    page.evaluate("window.TGGStreetEvents.start('downtown-cypher')")
    page.evaluate("window.TGGStreetEvents.finish()")
    set_after_one=page.evaluate("window.TGGStreetSets.status()")
    check('street-set-first-step',set_after_one.get('step')==1 and set_after_one.get('expected')=='studio-sidewalk',json.dumps(set_after_one))

    page.evaluate("window.TGGStreetEvents.start('downtown-cypher')")
    page.evaluate("window.TGGStreetEvents.finish()")
    set_wrong=page.evaluate("window.TGGStreetSets.status()")
    check('street-set-order-lock',set_wrong.get('step')==1 and set_wrong.get('expected')=='studio-sidewalk' and set_wrong.get('lastResult',{}).get('status')=='out_of_order',json.dumps(set_wrong))

    page.evaluate("""() => {
      const e=window.TGGStreetEvents.get('studio-sidewalk');const s=window.TGGGame.getState();
      s.x=e.x/.92+50;s.y=e.z/.92+50;window.TGGGame.refresh();
    }""")
    set_cash_before=page.evaluate("({cash:window.TGGGame.getState().cash,xp:window.TGGGame.getState().xp})")
    page.evaluate("window.TGGStreetEvents.start('studio-sidewalk')")
    page.evaluate("window.TGGStreetEvents.finish()")
    set_done=page.evaluate("window.TGGStreetSets.status()")
    set_cash_after=page.evaluate("({cash:window.TGGGame.getState().cash,xp:window.TGGGame.getState().xp})")
    check('street-set-complete','block-to-studio' in set_done.get('completed',[]) and set_done.get('active') is None,json.dumps(set_done))
    check('street-set-no-reward',set_cash_after==set_cash_before,json.dumps([set_cash_before,set_cash_after]))
    set_unlocks=page.evaluate("window.TGGProgression.sync().unlocked")
    check('first-street-set-achievement','first-street-set' in set_unlocks,json.dumps(set_unlocks))
    check('street-sets-single-store',page.evaluate("localStorage.getItem('tgg-street-sets-v1')") is None)

    full_start=page.evaluate("window.TGGStreetSets.start('full-city-set')")
    check('full-city-set-start',full_start.get('active')=='full-city-set',json.dumps(full_start))
    for event_id in ['downtown-cypher','studio-sidewalk','mixtape-popout']:
        page.evaluate("""id => {
          const e=window.TGGStreetEvents.get(id);const s=window.TGGGame.getState();
          s.x=e.x/.92+50;s.y=e.z/.92+50;window.TGGGame.refresh();
        }""",event_id)
        page.evaluate("id => window.TGGStreetEvents.start(id)",event_id)
        page.evaluate("window.TGGStreetEvents.finish()")
    full_done=page.evaluate("window.TGGStreetSets.status()")
    check('full-city-set-complete','full-city-set' in full_done.get('completed',[]) and full_done.get('active') is None,json.dumps(full_done))
    check('crowd-momentum-live',full_done.get('momentum',0)>=55 and full_done.get('crowdBonus',0)>=1,json.dumps(full_done))
    momentum_unlocks=page.evaluate("window.TGGProgression.sync().unlocked")
    check('crowd-momentum-achievement','crowd-momentum' in momentum_unlocks,json.dumps(momentum_unlocks))

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
