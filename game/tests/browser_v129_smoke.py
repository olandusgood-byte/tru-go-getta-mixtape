import json
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen([sys.executable,'-m','http.server','8766','--bind','127.0.0.1'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
results=[]
errors=[]

def check(name,condition,detail=''):
    results.append({'name':name,'ok':bool(condition),'detail':detail})

try:
    time.sleep(.8)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'])
        page=browser.new_page(viewport={'width':1440,'height':1000})
        page.on('console',lambda m: errors.append('console:'+m.text) if m.type=='error' else None)
        page.on('pageerror',lambda e: errors.append('pageerror:'+str(e)))
        page.goto('http://127.0.0.1:8766/index.html',wait_until='load')
        page.wait_for_function("window.TGG3D && window.TGG3D.isReady && window.TGG3D.isReady()",timeout=30000)

        check('title',page.title()=='TRU GO GETTA — Game V1.29 3D',page.title())
        check('local-three-runtime',page.evaluate("window.THREE && window.THREE.REVISION")=='152',str(page.evaluate("window.THREE && window.THREE.REVISION")))

        page.click('#newGame')
        page.fill('#stageName','Tony Snow')
        page.select_option('#styleChoice',label='Rapper')
        page.click('#startGame')
        check('game-screen','active' in (page.locator('#game').get_attribute('class') or ''))

        page.click('#garageBtn')
        check('garage-screen','active' in (page.locator('#garage').get_attribute('class') or ''))
        page.click('[data-car-color="#ff315f"]')
        page.click('[data-wheel-color="#d4af37"]')
        page.click('[data-car-tune="drift"]')
        garage=page.evaluate("window.TGGGarage.getState()")
        tuning=page.evaluate("window.TGGGame.getDriveTuning()")
        appearance=page.evaluate("""() => ({
          color:'#'+window.TGG3D.car.userData.bodyMaterial.color.getHexString(),
          wheelColor:'#'+window.TGG3D.car.userData.wheelMaterial.color.getHexString()
        })""")
        check('garage-state',garage.get('color')=='#ff315f' and garage.get('wheelColor')=='#d4af37' and garage.get('tuning')=='drift',json.dumps(garage))
        check('drift-tune-applied',tuning.get('turnRate')==138 and tuning.get('maxForward')==11.2,json.dumps(tuning))
        check('car-paint-applied',appearance.get('color')=='#ff315f' and appearance.get('wheelColor')=='#d4af37',json.dumps(appearance))
        saved=page.evaluate("JSON.parse(localStorage.getItem('tgg-garage-v1'))")
        check('garage-persisted',saved==garage,json.dumps(saved))
        page.click('#garageBack')

        page.reload(wait_until='load')
        page.wait_for_function("window.TGG3D && window.TGG3D.isReady && window.TGG3D.isReady()")
        reloaded=page.evaluate("window.TGGGarage.getState()")
        reloaded_appearance=page.evaluate("""() => ({
          color:'#'+window.TGG3D.car.userData.bodyMaterial.color.getHexString(),
          wheelColor:'#'+window.TGG3D.car.userData.wheelMaterial.color.getHexString()
        })""")
        check('garage-reload-persistence',reloaded.get('color')=='#ff315f' and reloaded.get('wheelColor')=='#d4af37' and reloaded.get('tuning')=='drift',json.dumps(reloaded))
        check('appearance-reloads',reloaded_appearance=={'color':'#ff315f','wheelColor':'#d4af37'},json.dumps(reloaded_appearance))

        page.click('#continueGame')
        check('continue-game','active' in (page.locator('#game').get_attribute('class') or ''))

        margin=page.evaluate("""() => {
          for(let x=3;x<=94;x+=1){
            for(let y=8;y<=88;y+=1){
              if(window.TGG3D.canMovePercent(x,y,false) && !window.TGG3D.canMovePercent(x,y,true)) return {x,y};
            }
          }
          return null;
        }""")
        check('vehicle-collision-margin',margin is not None,json.dumps(margin))

        page.evaluate("""() => {
          const s=window.TGGGame.getState();
          s.x=72;s.y=36;s.mission=null;s.accepted=false;
          window.TGGGame.refresh();
        }""")
        check('manager-dialogue-visible',page.locator('#npcDialogue').is_visible() and 'M:' in page.locator('#npcDialogue').inner_text(),page.locator('#npcDialogue').inner_text())

        page.click('#studioBtn')
        page.wait_for_function("window.TGGStudio3D && window.TGGStudio3D.isReady && window.TGGStudio3D.isReady()",timeout=15000)
        check('studio-screen','active' in (page.locator('#studio').get_attribute('class') or ''))
        check('studio-3d-ready',page.locator('#studio3d canvas').count()==1)
        page.click('#studioBack')

        page.evaluate("""() => {
          const s=window.TGGGame.getState();
          s.x=50+5.7/.92;s.y=50+4.6/.92;s.heading=0;
          window.TGGGame.show('game');window.TGGGame.refresh();
        }""")
        entered=page.evaluate("window.TGGGame.toggleVehicle()")
        check('enter-car',entered is True and page.evaluate("window.TGGGame.getState().inVehicle") is True)

        page.evaluate("window.TGGGame.driveVehicle('forward'); window.TGGGame.driveVehicle('forward')")
        page.dispatch_event('#driftBtn','pointerdown',{'pointerId':1})
        page.wait_for_timeout(160)
        drift=page.evaluate("window.TGGGame.getDrivingState()")
        check('mobile-drift-control',drift.get('handbrake') is True,json.dumps(drift))
        page.dispatch_event('#driftBtn','pointerup',{'pointerId':1})

        page.click('#hornBtn')
        page.wait_for_timeout(80)
        check('mobile-horn-control','HONK!' in page.locator('#toast').inner_text(),page.locator('#toast').inner_text())

        check('mission-control-preserved',page.locator('#missionBtn').count()==1)
        check('save-control-preserved',page.locator('#saveBtn').count()==1)
        check('no-runtime-errors',not errors,'; '.join(errors))
        browser.close()
finally:
    server.terminate()
    try: server.wait(timeout=3)
    except: server.kill()

passed=sum(1 for x in results if x['ok'])
failed=len(results)-passed
print(json.dumps({'passed':passed,'failed':failed,'results':results,'errors':errors},indent=2))
if failed:
    sys.exit(1)
