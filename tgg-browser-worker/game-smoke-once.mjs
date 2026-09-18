import http from 'node:http';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';

const PORT = Number(process.env.PORT || 10000);
const TARGET = String(process.env.TGG_GAME_SMOKE_TARGET || '').trim();

function allowedTarget(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase();
    if (!/^tru-go-getta-world(?:-v\d+(?:-rc|-staging)?)?\.onrender\.com$/.test(host)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

let result = {
  ok: false,
  status: 'pending',
  target: TARGET || null,
  updated_at: new Date().toISOString()
};

async function launchChromium() {
  const options = {
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  };
  try {
    return await chromium.launch(options);
  } catch (error) {
    const message = error?.message || String(error);
    if (!message.includes("Executable doesn't exist")) throw error;
    console.log(JSON.stringify({ tgg_game_smoke_browser_repair: true, action: 'install_chromium_runtime' }));
    const install = spawnSync('npx', ['playwright', 'install', 'chromium'], {
      stdio: 'inherit',
      env: process.env
    });
    if (install.status !== 0) {
      throw new Error(`runtime_chromium_install_failed_${install.status ?? 'unknown'}`);
    }
    return await chromium.launch(options);
  }
}

async function runSmoke(target) {
  const browser = await launchChromium();
  const started = Date.now();
  const consoleErrors = [];
  const pageErrors = [];
  const failedResources = [];

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 500));
    });
    page.on('pageerror', err => pageErrors.push(String(err?.message || err).slice(0, 500)));
    page.on('response', response => {
      if (response.status() >= 400) {
        failedResources.push({ url: response.url(), status: response.status() });
      }
    });

    const response = await page.goto(target, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });
    await page.waitForTimeout(1200);

    const title = await page.title();

    const releaseQa = await page.evaluate(() => {
      try {
        return window.TGGReleaseQA?.run?.() || null;
      } catch (error) {
        return { passed: false, error: error?.message || String(error), checks: [] };
      }
    });

    const foundationQa = await page.evaluate(() => {
      try {
        if (window.TGGQA && typeof window.TGGQA.run === 'function') return window.TGGQA.run();
        return window.TGGQA || null;
      } catch (error) {
        return { passed: false, error: error?.message || String(error) };
      }
    });

    const dom = await page.evaluate(() => ({
      title: document.title,
      menu: Boolean(document.getElementById('menu')),
      createPlayer: Boolean(document.getElementById('newGame')),
      gameScreen: Boolean(document.getElementById('game')),
      businessBoard: Boolean(document.getElementById('businessBoard')),
      businessApi: Boolean(window.TGGBusiness),
      worldSyncApi: Boolean(window.TGGWorldSync)
    }));

    const gameplay = await page.evaluate(() => {
      const checks = [];
      const record = (name, pass, detail='') => checks.push({ name, pass: Boolean(pass), detail });
      const active = id => document.getElementById(id)?.classList.contains('active') === true;
      const click = id => {
        const el = document.getElementById(id);
        if (!el) return false;
        el.click();
        return true;
      };
      const moveKey = key => document.dispatchEvent(new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true
      }));

      try {
        localStorage.removeItem('tgg-game-v1');
        window.TGGGame?.show?.('menu');

        record('menu-active', active('menu'));
        record('create-player-control', click('newGame'));

        const creatorOpened = active('creator');
        record('create-player-opens-creator', creatorOpened);

        if (creatorOpened) {
          const stage = document.getElementById('stageName');
          const style = document.getElementById('styleChoice');
          if (stage) stage.value = 'TGG QA PLAYER';
          if (style) style.value = 'Rapper';

          record('start-game-control', click('startGame'));
          const gameOpened = active('game');
          record('start-game-enters-city', gameOpened);
          record('hud-player-name', document.getElementById('hudName')?.textContent === 'TGG QA PLAYER');

          if (gameOpened && window.TGGGame?.getState) {
            const beforeMove = Number(window.TGGGame.getState()?.x);
            moveKey('ArrowRight');
            const afterMove = Number(window.TGGGame.getState()?.x);
            record('keyboard-movement', afterMove > beforeMove, `${beforeMove}->${afterMove}`);

            click('saveBtn');
            record('save-persistence', Boolean(localStorage.getItem('tgg-game-v1')));

            const beforePause = Number(window.TGGGame.getState()?.x);
            click('pauseBtn');
            const paused = active('pause');
            record('pause-opens', paused);
            moveKey('ArrowRight');
            const afterPauseMove = Number(window.TGGGame.getState()?.x);
            record('pause-freezes-movement', paused && afterPauseMove === beforePause, `${beforePause}->${afterPauseMove}`);

            click('resumeBtn');
            record('resume-returns-city', active('game'));

            window.TGGGame.show('menu');
            click('continueGame');
            record('continue-restores-city', active('game'));
            record('continue-keeps-player', document.getElementById('hudName')?.textContent === 'TGG QA PLAYER');

            window.TGGGame.show('game');
            click('missionBtn');
            click('missionBtn');
            const missionAccepted = window.TGGGame.getState()?.accepted === true;
            record('mission-accept', missionAccepted);

            if (missionAccepted) {
              const s = window.TGGGame.getState();
              s.x = 72;
              s.y = 36;
              window.TGGGame.refresh?.();
              const cashBefore = Number(s.cash || 0);
              click('missionBtn');
              const s2 = window.TGGGame.getState();
              record(
                'mission-complete',
                s2?.mission === null &&
                  s2?.accepted === false &&
                  Number(s2?.cash || 0) >= cashBefore + 250
              );
            } else {
              record('mission-complete', false, 'mission was not accepted');
            }

            click('businessBtn');
            record('business-opens', active('businessBoard'));
            record('business-grid-visible', Boolean(document.querySelector('#businessBoard .business-grid')));
          }
        }
      } catch (error) {
        record('gameplay-exception', false, error?.message || String(error));
      }

      return {
        passed: checks.length > 0 && checks.every(check => check.pass),
        checks
      };
    });

    const storyMission = await page.evaluate(() => {
      const api = window.TGGStoryMission;
      if (!api) return { present: false, passed: true, checks: [] };
      const checks = [];
      const record = (name, pass, detail='') => checks.push({ name, pass: Boolean(pass), detail });
      try {
        localStorage.removeItem('tgg-story-mission-v1');
        api.state.accepted = false;
        api.state.step = 0;
        api.state.completed = false;
        api.state.rewardClaimed = false;
        api.save();
        api.render();

        record('story-api', api.mission?.id === 'make-noise');
        record('story-ui', Boolean(document.getElementById('missionStoryBtn')) && Boolean(document.getElementById('missionStoryStatus')));
        record('story-accept', api.accept() === true && api.state.accepted === true);
        record('story-persist', Boolean(localStorage.getItem('tgg-story-mission-v1')));

        window.TGGContent.state.active = null;
        window.TGGContent.state.progress = 0;
        window.TGGContent.state.completed = [];
        window.TGGContent.save();
        const started = api.act();
        record('story-starts-first-job', started === true && window.TGGContent.state.active === 'flyer-run');

        window.TGGContent.state.active = null;
        window.TGGContent.state.completed = ['flyer-run','studio-session','mixtape-promo'];
        window.TGGContent.save();
        api.sync(false);
        record('story-final-step', api.currentStep()?.id === 'return-m');

        const game = window.TGGGame?.getState?.();
        const cashBefore = Number(game?.cash || 0);
        const claimed = api.claim();
        const cashAfter = Number(window.TGGGame?.getState?.()?.cash || 0);
        record('story-claim', claimed === true && api.state.completed === true && api.state.rewardClaimed === true);
        record('story-bonus', cashAfter >= cashBefore + 750, `${cashBefore}->${cashAfter}`);

        const cashBeforeSecond = Number(window.TGGGame?.getState?.()?.cash || 0);
        const claimedAgain = api.claim();
        const cashAfterSecond = Number(window.TGGGame?.getState?.()?.cash || 0);
        record('story-reward-once', claimedAgain === false && cashAfterSecond === cashBeforeSecond);
      } catch (error) {
        record('story-exception', false, error?.message || String(error));
      }
      return { present: true, passed: checks.length > 0 && checks.every(x => x.pass), checks };
    });

    const storyMission02 = await page.evaluate(() => {
      const api = window.TGGStoryMission02;
      if (!api) return { present: false, passed: true, checks: [] };
      const checks = [];
      const record = (name, pass, detail='') => checks.push({ name, pass: Boolean(pass), detail });
      try {
        localStorage.setItem('tgg-story-mission-v1', JSON.stringify({
          accepted:true, step:5, completed:true, rewardClaimed:true, updatedAt:Date.now()
        }));
        localStorage.removeItem('tgg-story-mission-v2');
        Object.assign(api.state,{
          accepted:false,choice:null,step:'locked',completed:false,rewardClaimed:false,consequence:null,updatedAt:0
        });
        api.save();
        api.sync(false);

        record('story02-api', api.mission?.id === 'pick-a-side');
        record('story02-ui',
          Boolean(document.getElementById('mission02Btn')) &&
          Boolean(document.getElementById('mission02Dj')) &&
          Boolean(document.getElementById('mission02Kane'))
        );
        record('story02-unlocked', api.mission1Complete() === true);
        record('story02-accept', api.accept() === true && api.state.accepted === true);

        const kaneChoice = api.choose('kane');
        record('story02-kane-choice',
          kaneChoice === true &&
          api.state.choice === 'kane' &&
          api.state.consequence === 'MASTERED'
        );

        Object.assign(api.state,{
          accepted:true,choice:null,step:'choice',completed:false,rewardClaimed:false,consequence:null
        });
        api.save();
        const djChoice = api.choose('dj');
        record('story02-dj-choice',
          djChoice === true &&
          api.state.choice === 'dj' &&
          api.state.consequence === 'AIRWAVES'
        );
        record('story02-choice-persist',
          JSON.parse(localStorage.getItem('tgg-story-mission-v2')||'{}')?.choice === 'dj'
        );
        record('story02-distinct-rewards',
          api.mission.routes.dj.reward.cash !== api.mission.routes.kane.reward.cash &&
          api.mission.routes.dj.reward.xp !== api.mission.routes.kane.reward.xp
        );

        window.TGGInventory?.mission02Pack?.();
        window.TGGContent.state.active = null;
        window.TGGContent.state.progress = 0;
        window.TGGContent.state.completed = ['flyer-run','studio-session','mixtape-promo'];
        window.TGGContent.save();
        api.sync(false);

        const routeStarted = api.act();
        record('story02-route-start',
          routeStarted === true && window.TGGContent.state.active === 'radio-run'
        );

        window.TGGContent.state.active = null;
        window.TGGContent.state.completed = ['flyer-run','studio-session','mixtape-promo','radio-run'];
        window.TGGContent.save();
        api.sync(false);
        const finaleStarted = api.act();
        record('story02-finale-start',
          finaleStarted === true && window.TGGContent.state.active === 'city-showdown'
        );

        window.TGGContent.state.active = null;
        window.TGGContent.state.completed = ['flyer-run','studio-session','mixtape-promo','radio-run','city-showdown'];
        window.TGGContent.save();
        api.sync(false);
        record('story02-return-step', api.state.step === 'return');

        const cashBefore = Number(window.TGGGame?.getState?.()?.cash || 0);
        const claimed = api.claim();
        const cashAfter = Number(window.TGGGame?.getState?.()?.cash || 0);
        record('story02-claim',
          claimed === true &&
          api.state.completed === true &&
          api.state.rewardClaimed === true &&
          api.state.consequence === 'AIRWAVES'
        );
        record('story02-route-bonus', cashAfter >= cashBefore + 1000, `${cashBefore}->${cashAfter}`);

        const beforeSecond = Number(window.TGGGame?.getState?.()?.cash || 0);
        const second = api.claim();
        const afterSecond = Number(window.TGGGame?.getState?.()?.cash || 0);
        record('story02-reward-once', second === false && afterSecond === beforeSecond);
      } catch (error) {
        record('story02-exception', false, error?.message || String(error));
      }
      return { present:true, passed:checks.length>0 && checks.every(x=>x.pass), checks };
    });

    const storyMission03 = await page.evaluate(() => {
      const api = window.TGGStoryMission03;
      if (!api) return { present:false, passed:true, checks:[] };
      const checks=[];
      const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
      try{
        localStorage.setItem('tgg-story-mission-v2',JSON.stringify({
          accepted:true,choice:'dj',step:'complete',completed:true,rewardClaimed:true,
          consequence:'AIRWAVES',updatedAt:Date.now()
        }));
        localStorage.removeItem('tgg-story-mission-v3');
        Object.assign(api.state,{
          accepted:false,choice:null,step:'locked',completed:false,rewardClaimed:false,
          consequence:null,priorConsequence:null,updatedAt:0
        });
        api.save();
        api.sync(false);

        record('story03-api',api.mission?.id==='the-offer');
        record('story03-ui',
          Boolean(document.getElementById('mission03Btn')) &&
          Boolean(document.getElementById('mission03Deal')) &&
          Boolean(document.getElementById('mission03Indie'))
        );
        record('story03-unlocked',api.mission02Complete()===true);
        record('story03-prior-consequence',api.state.priorConsequence==='AIRWAVES');
        record('story03-accept',api.accept()===true&&api.state.accepted===true);

        const dealChoice=api.choose('deal');
        record('story03-deal-choice',
          dealChoice===true &&
          api.state.choice==='deal' &&
          api.state.consequence==='SIGNED'
        );

        Object.assign(api.state,{
          accepted:true,choice:null,step:'choice',completed:false,rewardClaimed:false,
          consequence:null,priorConsequence:'AIRWAVES'
        });
        api.save();

        const indieChoice=api.choose('indie');
        record('story03-indie-choice',
          indieChoice===true &&
          api.state.choice==='indie' &&
          api.state.consequence==='INDEPENDENT'
        );
        record('story03-choice-persist',
          JSON.parse(localStorage.getItem('tgg-story-mission-v3')||'{}')?.choice==='indie'
        );
        record('story03-distinct-rewards',
          api.mission.routes.deal.reward.cash>api.mission.routes.indie.reward.cash &&
          api.mission.routes.indie.reward.rep>api.mission.routes.deal.reward.rep &&
          api.mission.routes.indie.reward.xp>api.mission.routes.deal.reward.xp
        );

        window.TGGInventory?.mission03Pack?.();
        window.TGGContent.state.active=null;
        window.TGGContent.state.progress=0;
        window.TGGContent.state.completed=[
          'flyer-run','studio-session','mixtape-promo','radio-run','city-showdown'
        ];
        window.TGGContent.save();
        api.sync(false);

        const routeStarted=api.act();
        record('story03-route-start',
          routeStarted===true&&window.TGGContent.state.active==='indie-rollout'
        );

        window.TGGContent.state.active=null;
        window.TGGContent.state.completed=[
          'flyer-run','studio-session','mixtape-promo','radio-run','city-showdown','indie-rollout'
        ];
        window.TGGContent.save();
        api.sync(false);

        const finaleStarted=api.act();
        record('story03-finale-start',
          finaleStarted===true&&window.TGGContent.state.active==='release-night'
        );

        window.TGGContent.state.active=null;
        window.TGGContent.state.completed=[
          'flyer-run','studio-session','mixtape-promo','radio-run','city-showdown',
          'indie-rollout','release-night'
        ];
        window.TGGContent.save();
        api.sync(false);
        record('story03-return-step',api.state.step==='return');

        const cashBefore=Number(window.TGGGame?.getState?.()?.cash||0);
        const claimed=api.claim();
        const cashAfter=Number(window.TGGGame?.getState?.()?.cash||0);
        record('story03-claim',
          claimed===true &&
          api.state.completed===true &&
          api.state.rewardClaimed===true &&
          api.state.consequence==='INDEPENDENT'
        );
        record('story03-route-bonus',cashAfter>=cashBefore+900,`${cashBefore}->${cashAfter}`);

        const beforeSecond=Number(window.TGGGame?.getState?.()?.cash||0);
        const second=api.claim();
        const afterSecond=Number(window.TGGGame?.getState?.()?.cash||0);
        record('story03-reward-once',second===false&&afterSecond===beforeSecond);
      }catch(error){
        record('story03-exception',false,error?.message||String(error));
      }
      return {present:true,passed:checks.length>0&&checks.every(x=>x.pass),checks};
    });

    const storyMission04 = await page.evaluate(() => {
      const api=window.TGGStoryMission04;
      const performance=window.TGGPerformance;
      if(!api||!performance)return {present:false,passed:true,checks:[]};
      const checks=[];
      const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
      try{
        localStorage.setItem('tgg-story-mission-v3',JSON.stringify({
          accepted:true,choice:'indie',step:'complete',completed:true,rewardClaimed:true,
          consequence:'INDEPENDENT',priorConsequence:'AIRWAVES',updatedAt:Date.now()
        }));
        localStorage.removeItem('tgg-story-mission-v4');
        Object.assign(api.state,{
          accepted:false,choice:null,step:'locked',completed:false,rewardClaimed:false,
          consequence:null,priorCareer:null,performanceScore:0,updatedAt:0
        });
        api.save();
        performance.reset();
        api.sync(false);

        record('story04-api',api.mission?.id==='the-headliner');
        record('story04-ui',
          Boolean(document.getElementById('mission04Btn')) &&
          Boolean(document.getElementById('mission04Club')) &&
          Boolean(document.getElementById('mission04Festival')) &&
          Boolean(document.getElementById('showBoard'))
        );
        record('story04-unlocked',api.mission03Complete()===true);
        record('story04-prior-career',api.state.priorCareer==='INDEPENDENT');
        record('story04-accept',api.accept()===true&&api.state.accepted===true);

        const clubChoice=api.choose('club');
        record('story04-club-choice',
          clubChoice===true &&
          api.state.choice==='club' &&
          api.state.consequence==='CLUB_HEADLINER'
        );

        Object.assign(api.state,{
          accepted:true,choice:null,step:'choice',completed:false,rewardClaimed:false,
          consequence:null,priorCareer:'INDEPENDENT',performanceScore:0
        });
        api.save();
        performance.reset();

        const festivalChoice=api.choose('festival');
        record('story04-festival-choice',
          festivalChoice===true &&
          api.state.choice==='festival' &&
          api.state.consequence==='FESTIVAL_BREAKOUT'
        );
        record('story04-choice-persist',
          JSON.parse(localStorage.getItem('tgg-story-mission-v4')||'{}')?.choice==='festival'
        );
        record('story04-distinct-rewards',
          api.mission.routes.club.reward.cash>api.mission.routes.festival.reward.cash &&
          api.mission.routes.festival.reward.rep>api.mission.routes.club.reward.rep
        );

        window.TGGInventory?.mission04Pack?.();
        window.TGGContent.state.active=null;
        window.TGGContent.state.progress=0;
        window.TGGContent.state.completed=[
          'flyer-run','studio-session','mixtape-promo','radio-run','city-showdown',
          'indie-rollout','release-night'
        ];
        window.TGGContent.save();
        api.sync(false);

        const routeStarted=api.act();
        record('story04-route-start',
          routeStarted===true&&window.TGGContent.state.active==='festival-push'
        );

        window.TGGContent.state.active=null;
        window.TGGContent.state.completed=[
          'flyer-run','studio-session','mixtape-promo','radio-run','city-showdown',
          'indie-rollout','release-night','festival-push'
        ];
        window.TGGContent.save();
        api.sync(false);
        record('story04-performance-step',api.state.step==='performance');

        const showStarted=api.act();
        record('performance-start',
          showStarted===true &&
          performance.state.started===true &&
          performance.state.route==='festival' &&
          document.getElementById('showBoard')?.classList.contains('active')===true,
          JSON.stringify({
            showStarted,
            performanceStarted:performance.state.started,
            performanceRoute:performance.state.route,
            showActive:document.getElementById('showBoard')?.classList.contains('active')===true,
            headlinePass:window.TGGInventory?.get?.('headline-pass'),
            storyStep:api.state.step,
            storyChoice:api.state.choice,
            storyAccepted:api.state.accepted,
            performanceCompleted:performance.state.completed
          })
        );

        const intro=performance.act('intro');
        const crowd=performance.act('crowd');
        const closer=performance.act('closer');
        record('performance-three-moves',intro===true&&crowd===true&&closer===true&&performance.state.actions.length===3);
        record('performance-crowd-threshold',performance.state.score>=90, String(performance.state.score));
        record('performance-complete',performance.state.completed===true&&performance.state.rewardClaimed===true);

        const scoreBeforeRepeat=performance.state.score;
        const repeat=performance.act('crowd');
        record('performance-no-repeat',repeat===false&&performance.state.score===scoreBeforeRepeat);

        api.sync(false);
        record('story04-return-step',api.state.step==='return');

        const cashBefore=Number(window.TGGGame?.getState?.()?.cash||0);
        const claimed=api.claim();
        const cashAfter=Number(window.TGGGame?.getState?.()?.cash||0);
        record('story04-claim',
          claimed===true &&
          api.state.completed===true &&
          api.state.rewardClaimed===true &&
          api.state.consequence==='FESTIVAL_BREAKOUT' &&
          api.state.performanceScore>=90
        );
        record('story04-route-bonus',cashAfter>=cashBefore+1100,`${cashBefore}->${cashAfter}`);

        const beforeSecond=Number(window.TGGGame?.getState?.()?.cash||0);
        const second=api.claim();
        const afterSecond=Number(window.TGGGame?.getState?.()?.cash||0);
        record('story04-reward-once',second===false&&afterSecond===beforeSecond);
      }catch(error){
        record('story04-exception',false,error?.message||String(error));
      }
      return {present:true,passed:checks.length>0&&checks.every(x=>x.pass),checks};
    });

    const storyMission05 = await page.evaluate(() => {
      const api=window.TGGStoryMission05;
      const battle=window.TGGBattle;
      if(!api||!battle)return {present:false,passed:false,checks:[{name:'story05-api',pass:false,detail:'missing'}]};
      const checks=[];
      const record=(name,pass,detail='')=>checks.push({name,pass:Boolean(pass),detail});
      try{
        localStorage.setItem('tgg-story-mission-v4',JSON.stringify({
          accepted:true,choice:'festival',step:'complete',completed:true,rewardClaimed:true,
          consequence:'FESTIVAL_BREAKOUT',performanceScore:105,updatedAt:Date.now()
        }));
        localStorage.removeItem('tgg-story-mission-v5');
        Object.assign(api.state,{accepted:false,style:null,step:'locked',completed:false,rewardClaimed:false,consequence:null,battleScore:0,updatedAt:0});
        api.save();battle.reset();api.sync(false);

        record('story05-api',api.mission?.id==='rival-callout');
        record('story05-ui',Boolean(document.getElementById('mission05Btn'))&&Boolean(document.getElementById('battleBoard'))&&document.querySelectorAll('[data-battle-move]').length===3);
        record('story05-unlocked',api.mission04Complete()===true);
        record('story05-accept',api.accept()===true&&api.state.accepted===true&&api.state.step==='choice');
        record('story05-bars-choice',api.choose('bars')===true&&api.state.style==='bars'&&api.state.consequence==='BAR_FOR_BAR');
        record('story05-choice-persist',JSON.parse(localStorage.getItem('tgg-story-mission-v5')||'{}')?.style==='bars');

        const started=api.act();
        record('battle-start',started===true&&battle.state.started===true&&battle.state.style==='bars'&&document.getElementById('battleBoard')?.classList.contains('active')===true);

        const a=battle.act('setup'),b=battle.act('punchline'),d=battle.act('rebuttal');
        record('battle-three-rounds',a===true&&b===true&&d===true&&battle.state.moves.length===3);
        record('battle-score',battle.state.score>battle.state.rivalScore,String(battle.state.score)+'>'+String(battle.state.rivalScore));
        record('battle-win',battle.state.completed===true&&battle.state.won===true&&battle.state.rewardClaimed===true);

        const repeat=battle.act('setup');
        record('battle-no-repeat',repeat===false);

        api.sync(false);
        record('story05-return',api.state.step==='return');

        const cashBefore=Number(window.TGGGame?.getState?.()?.cash||0);
        const claimed=api.claim();
        const cashAfter=Number(window.TGGGame?.getState?.()?.cash||0);
        record('story05-claim',claimed===true&&api.state.completed===true&&api.state.rewardClaimed===true&&api.state.battleScore===battle.state.score);
        record('story05-route-reward',cashAfter>=cashBefore+api.mission.styles.bars.reward.cash,`${cashBefore}->${cashAfter}`);
        const secondBefore=Number(window.TGGGame?.getState?.()?.cash||0);
        const second=api.claim();
        record('story05-reward-once',second===false&&Number(window.TGGGame?.getState?.()?.cash||0)===secondBefore);
        record('story05-distinct-styles',api.mission.styles.bars.reward.cash!==api.mission.styles.crowd.reward.cash&&api.mission.styles.bars.consequence!==api.mission.styles.crowd.consequence);
      }catch(error){record('story05-exception',false,error?.message||String(error));}
      return {present:true,passed:checks.length>0&&checks.every(x=>x.pass),checks};
    });

    const mission06 = await page.evaluate(() => {
      const api = window.TGGStoryMission06;
      const campaign = window.TGGCrewCampaign;
      const crew = window.TGGCrew;
      if (!api || !campaign || !crew) return { present: false, passed: false, checks: [{name:'mission06-api',pass:false,detail:'missing API'}] };
      const checks = [];
      const record = (name, pass, detail='') => checks.push({ name, pass: Boolean(pass), detail });
      try {
        localStorage.setItem('tgg-story-mission-v5', JSON.stringify({ completed: true, rewardClaimed: true }));
        localStorage.removeItem('tgg-story-mission-v6');
        localStorage.removeItem('tgg-crew-campaign-v1');
        localStorage.setItem('tgg-crew-v1', JSON.stringify({ members: [], updatedAt: Date.now() }));
        crew.load();
        campaign.load();
        campaign.reset();
        api.state.accepted=false;
        api.state.step='offer';
        api.state.recruited=[];
        api.state.completed=false;
        api.state.rewardClaimed=false;
        api.state.campaignScore=0;
        api.save();
        api.sync(false);

        record('mission06-api', api.mission?.id === 'build-the-team');
        record('mission06-unlocked', api.mission05Complete() === true && api.state.step === 'offer');
        record('mission06-accept', api.accept() === true && api.state.accepted === true);
        record('mission06-recruit-kane', api.recruit('kane') === true && crew.has('kane'));
        record('mission06-recruit-nova', api.recruit('nova') === true && crew.has('nova'));
        record('mission06-recruit-lens', api.recruit('lens') === true && crew.has('lens'));
        api.sync(false);
        record('mission06-campaign-step', api.state.step === 'campaign' && crew.campaignReady() === true);

        const started = campaign.start();
        record('crew-campaign-start', started === true && campaign.state.started === true);
        record('crew-campaign-record', campaign.act('record') === true);
        record('crew-campaign-visual', campaign.act('visual') === true);
        record('crew-campaign-promo', campaign.act('promo') === true);
        record('crew-campaign-complete', campaign.state.completed === true && campaign.state.score >= 132, String(campaign.state.score));

        api.sync(false);
        record('mission06-return-step', api.state.step === 'return');

        const cashBefore = Number(window.TGGGame?.getState?.()?.cash || 0);
        const claim = api.claim();
        const cashAfter = Number(window.TGGGame?.getState?.()?.cash || 0);
        record('mission06-claim', claim === true && api.state.completed === true && api.state.rewardClaimed === true);
        record('mission06-reward', cashAfter >= cashBefore + 2000, `${cashBefore}->${cashAfter}`);

        const cashBeforeAgain = Number(window.TGGGame?.getState?.()?.cash || 0);
        const second = api.claim();
        const cashAfterAgain = Number(window.TGGGame?.getState?.()?.cash || 0);
        record('mission06-reward-once', second === false && cashAfterAgain === cashBeforeAgain);
      } catch (error) {
        record('mission06-exception', false, error?.message || String(error));
      }
      return { present: true, passed: checks.length > 0 && checks.every(x=>x.pass), checks };
    });

    const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
    await context.close();

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true
    });
    const mobilePage = await mobile.newPage();
    const mobileResponse = await mobilePage.goto(target, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });
    await mobilePage.waitForTimeout(700);
    const mobileLayout = await mobilePage.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowX: document.documentElement.scrollWidth > innerWidth + 1
    }));
    await mobile.close();

    const releasePassed = releaseQa?.passed === true;
    const pass =
      (response?.status() || 0) >= 200 &&
      (response?.status() || 0) < 400 &&
      (mobileResponse?.status() || 0) >= 200 &&
      (mobileResponse?.status() || 0) < 400 &&
      releasePassed &&
      foundationQa?.passed === true &&
      gameplay?.passed === true &&
      storyMission?.passed === true &&
      storyMission02?.passed === true &&
      storyMission03?.passed === true &&
      storyMission04?.passed === true &&
      storyMission05?.passed === true &&
      pageErrors.length === 0 &&
      consoleErrors.length === 0 &&
      failedResources.length === 0 &&
      mobileLayout.overflowX === false &&
      dom.menu &&
      dom.createPlayer &&
      dom.gameScreen &&
      dom.businessBoard &&
      dom.businessApi &&
      dom.worldSyncApi;

    return {
      ok: pass,
      status: pass ? 'passed' : 'failed',
      target,
      http_status: response?.status() || 0,
      mobile_http_status: mobileResponse?.status() || 0,
      title,
      release_qa_passed: releasePassed,
      release_qa_failed_checks: Array.isArray(releaseQa?.checks)
        ? releaseQa.checks.filter(x => !x.pass).slice(0, 20)
        : [],
      foundation_qa_passed: foundationQa?.passed === true,
      story_mission: storyMission,
      story_mission_02: storyMission02,
      story_mission_03: storyMission03,
      story_mission_04: storyMission04,
      story_mission_05: storyMission05,
      gameplay,
      dom,
      console_errors: consoleErrors,
      page_errors: pageErrors,
      failed_resources: failedResources.slice(0, 20),
      mobile: mobileLayout,
      screenshot_sha256: sha256(screenshot),
      elapsed_ms: Date.now() - started,
      updated_at: new Date().toISOString()
    };
  } finally {
    await browser.close();
  }
}

const target = allowedTarget(TARGET);
if (!target) {
  result = {
    ok: false,
    status: 'invalid_target',
    target: TARGET || null,
    updated_at: new Date().toISOString()
  };
  console.error(JSON.stringify({ tgg_game_smoke_once: true, ...result }));
} else {
  runSmoke(target)
    .then(r => {
      result = r;
      console.log(JSON.stringify({ tgg_game_smoke_once: true, ...r }));
    })
    .catch(error => {
      result = {
        ok: false,
        status: 'error',
        target,
        error: error?.message || String(error),
        updated_at: new Date().toISOString()
      };
      console.error(JSON.stringify({ tgg_game_smoke_once: true, ...result }));
    });
}

http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  if (req.url === '/health') {
    res.end(JSON.stringify({ ok: true, smoke_status: result.status, target: result.target }));
    return;
  }
  res.end(JSON.stringify(result));
}).listen(PORT, () => {
  console.log(JSON.stringify({
    tgg_game_smoke_once_server: true,
    port: PORT,
    target: target || TARGET || null
  }));
});
