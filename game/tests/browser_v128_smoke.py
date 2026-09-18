import json
import subprocess
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen([sys.executable,'-m','http.server','8765','--bind','127.0.0.1'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
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
        page.goto('http://127.0.0.1:8765/index.html',wait_until='load')
        page.wait_for_function("window.TGG3D && window.TGG3D.isReady && window.TGG3D.isReady()",timeout=30000)

        check('title',page.title()=='TRU GO GETTA — Game V1.28 3D',page.title())
        page.click('#newGame')
        page.fill('#stageName','Tony Snow')
        page.select_option('#styleChoice',label='Rapper')
        page.click('#startGame')
        check('game-screen','active' in (page.locator('#game').get_attribute('class') or ''))

        ready=page.evaluate("window.TGG3D.isReady()")
        check('3d-ready',ready is True,str(ready))
        check('starter-car',page.evaluate("!!window.TGG3D.car"))
        check('radar-present',page.locator('#radar3d').count()==1)
        check('drive-hud-present',page.locator('#vehicleHud').count()==1)

        page.evaluate("""() => {
          const s=window.TGGGame.getState();
          s.x=50+5.7/.92;
          s.y=50+4.6/.92;
          s.heading=0;
          window.TGGGame.refresh();
        }""")
        page.wait_for_timeout(200)
        distance=page.evaluate("window.TGG3D.distanceToCarPercent(window.TGGGame.getState())")
        check('near-car',distance<1.5,str(distance))

        entered=page.evaluate("window.TGGGame.toggleVehicle()")
        check('enter-car',entered is True and page.evaluate("window.TGGGame.getState().inVehicle") is True)
        check('auto-chase',page.evaluate("window.TGG3D.getCameraMode()")=='chase')

        page.evaluate("window.TGGGame.driveVehicle('forward'); window.TGGGame.driveVehicle('forward')")
        page.keyboard.down('ArrowUp')
        page.wait_for_timeout(120)
        speed=page.evaluate("window.TGGGame.getDrivingState().speed")
        check('accelerates',speed>2,str(speed))

        page.keyboard.down(' ')
        page.wait_for_timeout(220)
        drift=page.evaluate("window.TGGGame.getDrivingState()")
        visual=page.evaluate("window.TGG3D.getVehicleDynamics()")
        drive_label=page.locator('#driveStateValue').inner_text()
        skid=page.evaluate("Math.max(...window.TGG3D.car.userData.skidMarks.map(x=>x.material.opacity))")
        check('handbrake-state',drift.get('handbrake') is True,json.dumps(drift))
        check('3d-handbrake-sync',visual.get('handbrake') is True,json.dumps(visual))
        check('drift-hud',drive_label=='DRIFT',drive_label)
        check('drift-visual',skid>0.05,str(skid))

        honked=page.evaluate("window.TGGGame.horn()")
        page.wait_for_timeout(80)
        check('horn-call',honked is True)
        check('horn-toast','HONK!' in page.locator('#toast').inner_text(),page.locator('#toast').inner_text())

        page.keyboard.up(' ')
        page.keyboard.up('ArrowUp')
        page.wait_for_timeout(150)
        after_release=page.evaluate("window.TGGGame.getDrivingState()")
        check('handbrake-released',after_release.get('handbrake') is False,json.dumps(after_release))

        exited=page.evaluate("window.TGGGame.toggleVehicle()")
        check('exit-car',exited is True and page.evaluate("window.TGGGame.getState().inVehicle") is False)
        check('camera-restores-orbit',page.evaluate("window.TGG3D.getCameraMode()")=='orbit')

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
