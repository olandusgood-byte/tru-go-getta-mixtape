import json
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text(encoding='utf-8')
css=(ROOT/'style.css').read_text(encoding='utf-8')
html=html.replace('<link rel="stylesheet" href="style.css">','<style>'+css+'</style>')

def inline_script(match):
    src=match.group(1)
    js=(ROOT/src).read_text(encoding='utf-8').replace('</script','<\\/script')
    return '<script data-inline-src="'+src+'">'+js+'</script>'

html=re.sub(r'<script src="([^"]+)"></script>',inline_script,html)
results=[]
errors=[]

def check(name,condition,detail=''):
    results.append({'name':name,'ok':bool(condition),'detail':detail})

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.on('console',lambda m: errors.append('console:'+m.text) if m.type=='error' else None)
    page.on('pageerror',lambda e: errors.append('pageerror:'+str(e)))
    page.evaluate("""() => {
      const store=new Map();
      const ls={
        getItem:k=>store.has(String(k))?store.get(String(k)):null,
        setItem:(k,v)=>store.set(String(k),String(v)),
        removeItem:k=>store.delete(String(k)),
        clear:()=>store.clear(),
        key:i=>Array.from(store.keys())[i]??null,
        get length(){return store.size}
      };
      Object.defineProperty(window,'localStorage',{value:ls,configurable:true});
    }""")
    page.set_content(html,wait_until='load')

    check('v122-title',page.title()=='TRU GO GETTA — Game V1.22',page.title())
    check('no-initial-runtime-errors',not errors,'; '.join(errors))

    page.click('#newGame')
    check('creator-screen','active' in (page.locator('#creator').get_attribute('class') or ''))
    page.fill('#stageName','Tony Snow')
    page.select_option('#styleChoice',label='Rapper')
    page.click('#startGame')
    check('game-screen','active' in (page.locator('#game').get_attribute('class') or ''))
    check('player-name',page.locator('#hudName').inner_text()=='Tony Snow',page.locator('#hudName').inner_text())
    page.wait_for_function("window.TGGWorld3D && (window.TGGWorld3D.status().ready || window.TGGWorld3D.status().failed)", timeout=30000)
    world3d=page.evaluate("window.TGGWorld3D.status()")
    check('world3d-ready',world3d.get('ready') is True,json.dumps(world3d))
    check('three-revision',str(world3d.get('revision'))=='186',json.dumps(world3d))
    check('webgl-canvas',page.locator('#world3d canvas').count()==1)
    check('3d-building-count',world3d.get('buildings',0)>=30,json.dumps(world3d))
    check('3d-road-count',world3d.get('roads',0)>=6,json.dumps(world3d))
    before3d=world3d.get('player',{})
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(250)
    after3d=page.evaluate("window.TGGWorld3D.status().player")
    check('3d-player-moves',abs(after3d.get('x',0)-before3d.get('x',0))>0.05,json.dumps([before3d,after3d]))
    collision=page.evaluate("""() => ({
      buildingBlocked: !window.TGGWorld3D.canMovePercent(60,64.285714),
      roadOpen: window.TGGWorld3D.canMovePercent(50,55),
      colliders: window.TGGWorld3D.status().colliders
    })""")
    check('3d-collision-volume',collision.get('buildingBlocked') is True and collision.get('roadOpen') is True and collision.get('colliders',0)>=40,json.dumps(collision))
    canvas=page.locator('#world3d canvas')
    box=canvas.bounding_box()
    orbit_before=page.evaluate("window.TGGWorld3D.status().orbit")
    page.mouse.move(box['x']+box['width']*0.55,box['y']+box['height']*0.5)
    page.mouse.down()
    page.mouse.move(box['x']+box['width']*0.72,box['y']+box['height']*0.42,steps=5)
    page.mouse.up()
    page.wait_for_timeout(100)
    orbit_after=page.evaluate("window.TGGWorld3D.status().orbit")
    check('camera-orbit-drag',abs(orbit_after.get('yaw',0)-orbit_before.get('yaw',0))>0.05,json.dumps([orbit_before,orbit_after]))
    distance_before=orbit_after.get('distance',0)
    page.mouse.move(box['x']+box['width']*0.5,box['y']+box['height']*0.5)
    page.mouse.wheel(0,600)
    page.wait_for_timeout(80)
    distance_after=page.evaluate("window.TGGWorld3D.status().orbit.distance")
    check('camera-wheel-zoom',abs(distance_after-distance_before)>0.2,f'{distance_before}->{distance_after}')
    layout=page.evaluate("""() => {
      const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
      const city=box(document.querySelector('.game-shell .city'));
      const controls=box(document.querySelector('.game-controls'));
      const move=box(document.querySelector('.move-pad'));
      const deck=box(document.querySelector('.action-deck'));
      const buttons=[...document.querySelectorAll('.action-deck .actions button')].map(box);
      const minH=Math.min(...buttons.map(x=>x.height));
      const player=box(document.getElementById('player'));
      return {city,controls,move,deck,minH,player,towers:document.querySelectorAll('.city-depth .tower').length};
    }""")
    check('controls-below-city',layout['controls']['top']>=layout['city']['bottom']-3,json.dumps(layout))
    check('action-buttons-readable',layout['minH']>=48,json.dumps(layout))
    check('move-pad-separated',layout['move']['right']<=layout['deck']['left']+3,json.dumps(layout))
    check('player-depth-size',layout['player']['height']>=80 and layout['towers']>=4,json.dumps(layout))
    page.click('#eventsBtn')
    check('story-ui-auto-render',page.locator('[data-district-story]').count()==1)
    check('memory-ui-auto-render',page.locator('[data-route-memory]').count()==1)
    page.click('#eventsBack')

    before=page.locator('#player').evaluate('e=>e.style.left')
    page.keyboard.press('ArrowRight')
    after=page.locator('#player').evaluate('e=>e.style.left')
    check('keyboard-movement',before!=after,f'{before}->{after}')

    page.click('#pauseBtn')
    paused=page.locator('#player').evaluate('e=>e.style.left')
    page.keyboard.press('ArrowRight')
    paused_after=page.locator('#player').evaluate('e=>e.style.left')
    check('pause-freezes-movement',paused==paused_after,f'{paused}->{paused_after}')
    page.click('#resumeBtn')

    page.click('#missionBtn')
    check('mission-offered',page.locator('#missionBtn').inner_text()=='TAKE MISSION')
    page.click('#missionBtn')
    check('mission-accepted',page.locator('#missionBtn').inner_text()=='COMPLETE MISSION')
    page.evaluate("""() => {
      while(window.TGGGame.getState().x<72)window.TGGGame.move(2,0);
      while(window.TGGGame.getState().y>36)window.TGGGame.move(0,-2);
    }""")
    page.click('#missionBtn')
    check('mission-path-clear',page.locator('#hudCash').inner_text()=='250',page.locator('#hudCash').inner_text())
    check('mission-cash',page.locator('#hudCash').inner_text()=='250',page.locator('#hudCash').inner_text())
    check('mission-xp',page.locator('#hudXp').inner_text()=='50',page.locator('#hudXp').inner_text())

    page.click('#businessBtn')
    check('business-screen','active' in (page.locator('#businessBoard').get_attribute('class') or ''))
    check('live-city-panel',page.locator('#liveCityPanel').count()==1)
    qa=page.evaluate('window.TGGQA.run()')
    rqa=page.evaluate('window.TGGReleaseQA.run()')
    check('runtime-qa',qa.get('passed') is True,json.dumps([x for x in qa['report'] if x['status']!='PASS']))
    check('release-qa',rqa.get('passed') is True,json.dumps([x for x in rqa['checks'] if not x['pass']]))

    snap=page.evaluate('window.TGGBusiness.activitySnapshot()')
    check('activity-readonly',snap.get('readOnly') is True,json.dumps(snap))
    check('activity-count',len(snap.get('cityActivities',[]))>=3,str(len(snap.get('cityActivities',[]))))

    page.evaluate("""() => {
      window.__xss=0;
      window.TGGWorldSync.setTransport(async ({name})=>{
        if(name==='tgg_world_property_market')return {ok:true,data:[{id:'p1',name:'<img src=x onerror="window.__xss=99"> Studio Loft',district:'Studio Row',tier:2,status:'available'}]};
        if(name==='tgg_world_property_upgrades')return {ok:true,data:[{id:'u1',name:'Acoustic Treatment',level:1}]};
        if(name==='tgg_world_vehicle_progression')return {ok:true,data:[{id:'v1',model:'<svg onload="window.__xss=77"></svg> Night Runner',class:'coupe',level:3,status:'unlocked'}]};
        return {ok:true,data:{}};
      });
    }""")
    assets=page.evaluate('window.TGGBusiness.loadAssets()')
    check('world-assets-loaded',assets.get('ok') is True,json.dumps(assets))
    check('property-card',page.locator('[data-property-index="0"]').count()==1)
    check('vehicle-card',page.locator('[data-vehicle-index="0"]').count()==1)
    check('no-injected-img',page.locator('#worldProperties img').count()==0)
    check('no-injected-svg',page.locator('#worldVehicles svg').count()==0)
    check('xss-blocked',page.evaluate('window.__xss')==0,str(page.evaluate('window.__xss')))

    page.click('[data-property-index="0"]')
    check('property-readonly','READ ONLY' in page.locator('#businessDetail').inner_text())
    page.click('[data-vehicle-index="0"]')
    check('vehicle-readonly','READ ONLY' in page.locator('#businessDetail').inner_text())
    page.click('#businessBack')

    for btn,screen,back in [
      ('#parkBtn','#park','#parkBack'),
      ('#studioBtn','#studio','#studioBack'),
      ('#shopsBtn','#shops','#shopsBack'),
      ('#homeBtn','#home','#homeBack'),
      ('#mediaBtn','#media','#mediaBack')
    ]:
        page.click(btn)
        check('open-'+screen[1:],'active' in (page.locator(screen).get_attribute('class') or ''))
        page.click(back)
        check('back-'+screen[1:],'active' in (page.locator('#game').get_attribute('class') or ''))

    page.click('#progressionBtn')
    check('progression-screen','active' in (page.locator('#progressionBoard').get_attribute('class') or ''))
    page.click('#progressionBack')

    page.click('#saveBtn')
    page.click('#pauseBtn')
    page.click('#menuBtn')
    page.evaluate("document.getElementById('hudCash').textContent='9999'")
    page.click('#continueGame')
    check('continue-loads-save',page.locator('#hudName').inner_text()=='Tony Snow' and page.locator('#hudCash').inner_text()=='250')
    before_city=page.evaluate('window.TGGGame.getState().cash')
    start=page.evaluate("window.TGGCircuits.start('first-lap')")
    check('circuit-start',start.get('active')=='first-lap' and start.get('expected')=='street-cypher',json.dumps(start))
    page.evaluate("window.TGGInventory.add('notebook',3)")
    first_run=page.evaluate("window.TGGEvents.run('street-cypher')")
    after_first=page.evaluate("window.TGGCircuits.status()")
    check('circuit-first-step',first_run is True and after_first.get('step')==1 and after_first.get('expected')=='studio-pop-in',json.dumps(after_first))
    second_run=page.evaluate("window.TGGEvents.run('street-cypher')")
    after_second=page.evaluate("window.TGGCircuits.status()")
    check('circuit-order-lock',second_run is True and after_second.get('step')==1 and after_second.get('expected')=='studio-pop-in',json.dumps(after_second))
    third_run=page.evaluate("window.TGGEvents.run('street-cypher')")
    run_results=[first_run,second_run,third_run]
    check('three-city-runs',all(run_results),json.dumps(run_results))
    mastery=page.evaluate("window.TGGEvents.mastery('street-cypher')")
    check('city-mastery-regular',mastery.get('name')=='REGULAR',json.dumps(mastery))
    variant=page.evaluate("window.TGGCircuits.variant('street-cypher')")
    check('mastery-variant',variant.get('label')=='NO HOOK CYPHER' and variant.get('rewardMultiplier')==1 and variant.get('cosmeticOnly') is True,json.dumps(variant))
    profile=page.evaluate('window.TGGEvents.cityProfile()')
    check('city-rank-local-name',profile.get('rank')=='LOCAL NAME',json.dumps(profile))
    after_city=page.evaluate('window.TGGGame.getState().cash')
    check('base-event-economy-unchanged',after_city-before_city==540,f'{before_city}->{after_city}')
    unlocked=page.evaluate("window.TGGProgression.sync().unlocked")
    check('city-regular-achievement','city-regular' in unlocked,json.dumps(unlocked))
    page.evaluate("window.TGGInventory.add('mic',1)")
    studio_run=page.evaluate("window.TGGEvents.run('studio-pop-in')")
    circuit_done=page.evaluate("window.TGGCircuits.status()")
    check('first-lap-complete',studio_run is True and 'first-lap' in circuit_done.get('completed',[]) and circuit_done.get('active') is None,json.dumps(circuit_done))
    unlocked2=page.evaluate("window.TGGProgression.sync().unlocked")
    check('first-circuit-achievement','first-circuit' in unlocked2,json.dumps(unlocked2))
    profile2=page.evaluate('window.TGGEvents.cityProfile()')
    check('city-variety-streak',profile2.get('streak')==2 and profile2.get('bestStreak')>=2,json.dumps(profile2))

    district_state=page.evaluate("window.TGGDistrictStory.districtState(window.TGGDistrictStory.get('city-story-lap'))")
    locked_ids=[x.get('district') for x in district_state.get('locked',[])]
    check('district-level-gate','mixtape-ave' in locked_ids,json.dumps(district_state))
    blocked=page.evaluate("window.TGGDistrictStory.start('city-story-lap')")
    check('story-route-blocked-at-level-two',blocked.get('status')=='district_locked',json.dumps(blocked))

    page.evaluate("window.TGGGame.getState().level=3; window.TGGDistricts.sync(); window.TGGGame.refresh()")
    story_start=page.evaluate("window.TGGDistrictStory.start('city-story-lap')")
    check('story-route-started',story_start.get('activeRoute')=='city-story-lap' and story_start.get('currentBeat',{}).get('beat')=='GET SEEN',json.dumps(story_start))
    npc_one=page.evaluate("window.TGGRouteMemory.currentNpc()")
    check('downtown-contact',npc_one.get('id')=='m',json.dumps(npc_one))
    m_before=page.evaluate("window.TGGRouteMemory.relationship('m')")
    check('m-starts-stranger',m_before.get('tier')=='STRANGER',json.dumps(m_before))
    meet_one=page.evaluate("window.TGGRouteMemory.encounterCurrent()")
    m_after_first=page.evaluate("window.TGGRouteMemory.relationship('m')")
    meet_one_again=page.evaluate("window.TGGRouteMemory.encounterCurrent()")
    m_after_repeat=page.evaluate("window.TGGRouteMemory.relationship('m')")
    check('meet-m-once',meet_one.get('status')=='recorded' and meet_one_again.get('status')=='already_met',json.dumps([meet_one,meet_one_again]))
    check('m-familiar-from-mastery',m_after_first.get('tier')=='FAMILIAR',json.dumps(m_after_first))
    check('repeat-talk-no-progress',m_after_repeat.get('tier')==m_after_first.get('tier') and m_after_repeat.get('runs')==m_after_first.get('runs'),json.dumps([m_after_first,m_after_repeat]))
    check('single-memory-store',page.evaluate("localStorage.getItem('tgg-relationship-v1')") is None)

    before_story=page.evaluate("window.TGGGame.getState().cash")
    page.evaluate("window.TGGInventory.add('notebook',1); window.TGGInventory.add('mic',1); window.TGGInventory.add('beat-pack',1); window.TGGInventory.add('promo-flyers',1)")
    story_one=page.evaluate("window.TGGEvents.run('street-cypher')")
    beat_two=page.evaluate("window.TGGDistrictStory.currentBeat()")
    check('story-beat-studio',story_one is True and beat_two.get('beat')=='GET SHARP',json.dumps(beat_two))
    npc_two=page.evaluate("window.TGGRouteMemory.currentNpc()")
    meet_two=page.evaluate("window.TGGRouteMemory.encounterCurrent()")
    check('meet-kane',npc_two.get('id')=='producer' and meet_two.get('status')=='recorded',json.dumps([npc_two,meet_two]))

    story_two=page.evaluate("window.TGGEvents.run('studio-pop-in')")
    beat_three=page.evaluate("window.TGGDistrictStory.currentBeat()")
    check('story-beat-release',story_two is True and beat_three.get('beat')=='GET HEARD',json.dumps(beat_three))
    npc_three=page.evaluate("window.TGGRouteMemory.currentNpc()")
    meet_three=page.evaluate("window.TGGRouteMemory.encounterCurrent()")
    check('meet-dj-v',npc_three.get('id')=='dj' and meet_three.get('status')=='recorded',json.dumps([npc_three,meet_three]))

    story_three=page.evaluate("window.TGGEvents.run('release-rush')")
    story_done=page.evaluate("window.TGGDistrictStory.status()")
    check('district-story-complete',story_three is True and 'city-story-lap' in story_done.get('completed',[]) and story_done.get('activeRoute') is None,json.dumps(story_done))
    memory_snapshot=page.evaluate("window.TGGRouteMemory.memorySnapshot()")
    check('three-route-contacts',set(memory_snapshot.get('uniqueNpcIds',[]))=={'m','producer','dj'},json.dumps(memory_snapshot))
    districts_memory=memory_snapshot.get('districts',{})
    check('district-memory-recorded',all(districts_memory.get(x,{}).get('visits',0)>=1 for x in ['downtown','studio-row','mixtape-ave']),json.dumps(districts_memory))
    after_story=page.evaluate("window.TGGGame.getState().cash")
    check('story-router-no-extra-reward',after_story-before_story==905,f'{before_story}->{after_story}')
    route_unlocks=page.evaluate("window.TGGProgression.sync().unlocked")
    check('district-story-achievement','district-story' in route_unlocks,json.dumps(route_unlocks))
    check('npc-memory-achievement','know-the-city' in route_unlocks,json.dumps(route_unlocks))
    page.evaluate("window.TGGInventory.add('notebook',1)")
    before_trust=page.evaluate("window.TGGRouteMemory.relationship('m')")
    trust_run=page.evaluate("window.TGGEvents.run('street-cypher')")
    after_trust=page.evaluate("window.TGGRouteMemory.relationship('m')")
    check('mastery-advances-trust',trust_run is True and before_trust.get('tier')=='FAMILIAR' and after_trust.get('tier')=='TRUSTED',json.dumps([before_trust,after_trust]))
    m_dialogue=page.evaluate("window.TGGRouteMemory.dialogue('m')")
    check('trusted-dialogue-state',m_dialogue.get('tier')=='TRUSTED' and 'rooms' in m_dialogue.get('line','').lower(),json.dumps(m_dialogue))
    trust_unlocks=page.evaluate("window.TGGProgression.sync().unlocked")
    check('trusted-contact-achievement','trusted-contact' in trust_unlocks,json.dumps(trust_unlocks))
    page.click('#eventsBtn')
    check('contact-opportunities-ui',page.locator('[data-contact-opportunities]').count()==1)
    page.click('#eventsBack')
    manager_gate=page.evaluate("window.TGGContactOps.available('manager-intro')")
    producer_gate=page.evaluate("window.TGGContactOps.available('producer-lockin')")
    dj_gate=page.evaluate("window.TGGContactOps.available('dj-test-spin')")
    check('manager-opportunity-unlocked',manager_gate.get('ok') is True and manager_gate.get('relationship',{}).get('tier')=='TRUSTED',json.dumps(manager_gate))
    check('producer-opportunity-unlocked',producer_gate.get('ok') is True and producer_gate.get('relationship',{}).get('tier')=='FAMILIAR',json.dumps(producer_gate))
    check('dj-opportunity-still-locked',dj_gate.get('ok') is False and dj_gate.get('status')=='relationship_locked',json.dumps(dj_gate))
    op_start=page.evaluate("window.TGGContactOps.start('manager-intro')")
    check('manager-opportunity-started',op_start.get('active',{}).get('id')=='manager-intro',json.dumps(op_start))
    check('opportunities-single-store',page.evaluate("localStorage.getItem('tgg-contact-opportunities-v1')") is None)
    before_op=page.evaluate("window.TGGGame.getState().cash")
    page.evaluate("window.TGGInventory.add('beat-pack',1); window.TGGInventory.add('promo-flyers',1)")
    op_event=page.evaluate("window.TGGEvents.run('release-rush')")
    op_status=page.evaluate("window.TGGContactOps.status()")
    after_op=page.evaluate("window.TGGGame.getState().cash")
    check('manager-opportunity-complete',op_event is True and 'manager-intro' in op_status.get('completed',[]) and op_status.get('active') is None,json.dumps(op_status))
    check('opportunity-no-bonus-reward',after_op-before_op==450,f'{before_op}->{after_op}')
    opportunity_unlocks=page.evaluate("window.TGGProgression.sync().unlocked")
    check('first-opportunity-achievement','first-opportunity' in opportunity_unlocks,json.dumps(opportunity_unlocks))

    page.evaluate("""() => {
      window.__storyCalls=[];
      window.TGGWorldSync.setTransport(async ({name})=>{
        window.__storyCalls.push(name);
        if(name==='tgg_world_creative_missions')return {ok:true,data:[{id:'m1'},{id:'m2'}]};
        if(name==='tgg_world_npc_encounters')return {ok:true,data:[{id:'n1'}]};
        if(name==='tgg_world_story_control')return {ok:true,data:{chapter:'local-read'}};
        if(name==='tgg_world_memory_history')return {ok:true,data:[{id:'h1'}]};
        return {ok:false,error:'unexpected rpc '+name};
      });
    }""")
    remote=page.evaluate("window.TGGDistrictStory.refreshRemoteStory()")
    check('remote-story-summary',remote.get('ok') is True and remote.get('summary',{}).get('missions')==2 and remote.get('summary',{}).get('encounters')==1,json.dumps(remote))
    story_calls=page.evaluate("window.__storyCalls")
    approved={'tgg_world_creative_missions','tgg_world_npc_encounters','tgg_world_story_control','tgg_world_memory_history'}
    check('remote-story-readonly',set(story_calls)==approved,json.dumps(story_calls))

    page.evaluate("""() => {
      window.__memoryCalls=[];
      window.TGGWorldSync.setTransport(async ({name})=>{
        window.__memoryCalls.push(name);
        if(name==='tgg_world_npc_encounters')return {ok:true,data:[{id:'n1'},{id:'n2'}]};
        if(name==='tgg_world_memory_history')return {ok:true,data:[{id:'h1'}]};
        return {ok:false,error:'unexpected rpc '+name};
      });
    }""")
    remote_memory=page.evaluate("window.TGGRouteMemory.refreshRemoteMemory()")
    check('remote-memory-summary',remote_memory.get('ok') is True and remote_memory.get('summary',{}).get('encounters')==2 and remote_memory.get('summary',{}).get('memory')==1,json.dumps(remote_memory))
    memory_calls=page.evaluate("window.__memoryCalls")
    check('remote-memory-readonly',set(memory_calls)=={'tgg_world_npc_encounters','tgg_world_memory_history'},json.dumps(memory_calls))

    check('no-final-runtime-errors',not errors,'; '.join(errors))
    browser.close()

passed=sum(1 for item in results if item['ok'])
failed=len(results)-passed
print(json.dumps({'passed':passed,'failed':failed,'results':results,'errors':errors},indent=2))
if failed:
    sys.exit(1)
