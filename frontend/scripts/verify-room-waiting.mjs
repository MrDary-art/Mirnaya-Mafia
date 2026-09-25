import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const base='http://127.0.0.1:5176';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader']});
try {
  for (const width of [1440,390]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    const login=await context.request.post(base+'/api/auth/login',{data:{username:'demo',password:'demo'}});
    const {access_token}=await login.json();
    await context.addInitScript(token=>localStorage.setItem('arena_token',token),access_token);
    const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/rooms/demo');
    await page.getByRole('button',{name:'Два собеседования',exact:true}).click();
    await page.locator('#exhibit-report').scrollIntoViewIfNeeded();await page.waitForTimeout(1600);
    await page.screenshot({path:`../.cache/exhibit-qa/waiting-${width}.png`});
    await page.locator('.exhibit-verdict').scrollIntoViewIfNeeded();await page.waitForTimeout(1200);
    await page.screenshot({path:`../.cache/exhibit-qa/verdict-${width}.png`});
    assert.equal(await page.getByText('А если нет записи или данных?',{exact:true}).count(),0);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    let room={id:9999,mode:'duel',phase:'active',status:'active',your_id:1,your_name:'Алексей',your_role:'Кандидат',your_session_id:9999,duel_window_minutes:60,duration_minutes:15,deadline:new Date(Date.now()+3600000).toISOString(),participants:{1:{display_name:'Алексей'},2:{display_name:'Мария'}},scenario:{title:'Собеседование'},done:false};
    await page.route('**/api/sessions/9999',r=>r.fulfill({json:{id:9999,status:'active',messages:[{sender:'opponent',text:'Расскажите о вашем проекте.'}]}}));
    await page.route('**/api/rooms/9999',r=>r.fulfill({json:room}));
    await page.route('**/api/rooms/9999/attempt/start',r=>{room={...room,attempt_started_at:new Date().toISOString(),attempt_deadline:new Date(Date.now()+900000).toISOString()};return r.fulfill({json:room});});
    await page.goto(base+'/room/9999');
    await page.getByRole('button',{name:'Начать моё собеседование'}).click();
    await page.getByLabel('Реплика в комнате').waitFor();
    room={...room,done:true,participants:{1:{display_name:'Алексей',done:true},2:{display_name:'Мария',attempt_started_at:new Date().toISOString()}}};
    await page.getByRole('heading',{name:'Ваша попытка завершена'}).waitFor();
    assert.equal(await page.getByLabel('Реплика в комнате').count(),0);
    await page.screenshot({path:`../.cache/exhibit-qa/real-waiting-${width}.png`});
    room={...room,phase:'processing',processing_status:'analyzing'};
    await page.getByRole('heading',{name:'Зал ожидания',exact:true}).waitFor();
    room={...room,phase:'finished',competition:{status:'ready',winner_id:1,summary:'Сравнение завершено'},your_report:{summary:'Ваш отчёт',competition_feedback:{strength:'Аргументация',evidence:'Пример из вашего ответа',improvement:'Добавить измерения',better_answer:'Сравнить время до и после'}}};
    await page.getByRole('heading',{name:'В этой попытке вы справились лучше'}).waitFor();
    await page.getByText('Добавить измерения',{exact:true}).waitFor();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`../.cache/exhibit-qa/real-report-${width}.png`});
    assert.deepEqual(errors,[]);console.log(JSON.stringify({width,independentStart:true,waiting:true,privateReport:true,errors}));
    await context.close();
  }
} finally {await browser.close();}
