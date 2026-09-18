import json, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
html=(ROOT/'index.html').read_text(encoding='utf-8')
css=(ROOT/'style.css').read_text(encoding='utf-8')
html=html.replace('<link rel="stylesheet" href="style.css">','<style>'+css+'</style>')

def inline_script(m):
    src=m.group(1)
    js=(ROOT/src).read_text(encoding='utf-8').replace('</script','<\\/script')
    return '<script data-inline-src="'+src+'">'+js+'</script>'
html=re.sub(r'<script src="([^"]+)"></script>',inline_script,html)

results=[]
def check(name,ok,detail=''):
    results.append({'name':name,'ok':bool(ok),'detail':detail})

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('console',lambda m: errors.append(m.text) if m.type=='error' else None)
    page.set_content(html,wait_until='load')
    page.click('#newGame')
    page.fill('#stageName','V122 QA')
    page.click('#startGame')
    page.wait_for_function("window.TGGWorld3D && (window.TGGWorld3D.status().ready || window.TGGWorld3D.status().failed)",timeout=30000)
    s=page.evaluate("window.TGGWorld3D.status()")
    check('webgl-ready',s.get('ready') is True,json.dumps(s))
    check('colliders-built',s.get('colliders',0)>=20,json.dumps(s))
    snap=page.evaluate("window.TGGWorld3D.collisionSnapshot()")
    check('mission-reachable',snap.get('missionReachable') is True,json.dumps(snap))
    check('known-building-blocked',page.evaluate("window.TGGWorld3D.canMove(60,64)") is False)

    page.evaluate("window.TGGGame.getState().x=55;window.TGGGame.getState().y=64;window.TGGGame.refresh()")
    before=page.evaluate("window.TGGGame.getState().x")
    moved=page.evaluate("window.TGGGame.move(2,0)")
    after=page.evaluate("window.TGGGame.getState().x")
    check('movement-guard',moved is False and before==after,f'{before}->{after}')

    page.evaluate("window.TGGGame.getState().x=50;window.TGGGame.getState().y=55;window.TGGGame.refresh()")
    canvas=page.locator('#world3d canvas')
    box=canvas.bounding_box()
    cam0=page.evaluate("window.TGGWorld3D.cameraState()")
    page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
    page.mouse.down()
    page.mouse.move(box['x']+box['width']/2+130,box['y']+box['height']/2+30,steps=5)
    page.mouse.up()
    cam1=page.evaluate("window.TGGWorld3D.cameraState()")
    check('orbit-drag',abs(cam1.get('yaw',0)-cam0.get('yaw',0))>0.2,json.dumps([cam0,cam1]))
    page.mouse.wheel(0,500)
    page.wait_for_timeout(50)
    cam2=page.evaluate("window.TGGWorld3D.cameraState()")
    check('wheel-zoom',cam2.get('distance')!=cam1.get('distance'),json.dumps([cam1,cam2]))
    reset=page.evaluate("window.TGGWorld3D.resetCamera()")
    check('camera-reset',abs(reset.get('yaw',99))<.001 and abs(reset.get('distance',0)-10)<.001,json.dumps(reset))

    route=page.evaluate("""() => {
      let n=0;
      while(window.TGGGame.getState().x<72&&n++<40){if(window.TGGGame.move(2,0)===false)break;}
      n=0;
      while(window.TGGGame.getState().y>36&&n++<40){if(window.TGGGame.move(0,-2)===false)break;}
      const s=window.TGGGame.getState();
      return {x:s.x,y:s.y,ok:Math.abs(s.x-72)<10&&Math.abs(s.y-36)<10};
    }""")
    check('mission-route-open',route.get('ok') is True,json.dumps(route))
    check('no-runtime-errors',not errors,'; '.join(errors))
    browser.close()

failed=[x for x in results if not x['ok']]
print(json.dumps({'passed':len(results)-len(failed),'failed':len(failed),'results':results},indent=2))
if failed: sys.exit(1)
