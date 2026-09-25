import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const base='http://127.0.0.1:5176';
await mkdir('../.cache/booking-qa',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader']});
try {
  for(const width of (process.env.QA_WIDTH ? [Number(process.env.QA_WIDTH)] : [1440,390])) {
    const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'});
    const login=await context.request.post(base+'/api/auth/login',{data:{username:'demo',password:'demo'}});
    assert.equal(login.status(),200);
    const auth=await login.json();
    const identity=await (await context.request.get(base+'/api/auth/me',{headers:{Authorization:`Bearer ${auth.access_token}`}})).json();
    await context.addInitScript(token=>localStorage.setItem('arena_token',token),auth.access_token);
    let booked=false,invited=false;
    const room={id:8888,code:'booking-demo',mode:'human',host_id:identity.id,your_id:identity.id,guest_id:null,
      status:'waiting',phase:'scheduled',request_text:'Согласовать бюджет проекта',problem:'Согласовать бюджет проекта',
      scenario:{title:'Согласовать бюджет проекта'},participants:{},duration_minutes:15,
      scheduled_at:'2026-09-26T09:30:00Z',entry_opens_at:'2026-09-26T09:15:00Z',entry_available:false,
      awaiting_schedule:true,can_cancel:true,invite_path:'/rooms?code=booking-demo',report_available:false};
    await context.route('**/api/rooms',async route=>{
      if(route.request().method()==='POST'){booked=true;await route.fulfill({json:room});}
      else await route.fulfill({json:booked?[room]:[]});
    });
    await context.route('**/api/rooms/availability',route=>route.fulfill({json:{now:'2026-09-26T06:00:00Z',booked:[],quota:{active:booked?1:0,limit:3,remaining:booked?2:3}}}));
    await context.route('**/api/rooms/8888',route=>route.fulfill({json:room}));
    await context.route('**/api/social/friends',route=>route.fulfill({json:[{id:777,username:'Друг',relationship:'FRIENDS'}]}));
    await context.route('**/api/rooms/8888/invite',async route=>{invited=route.request().postDataJSON().friend_id===777;await route.fulfill({json:{sent:true}});});
    await context.route('**/api/rooms/8888/cancel',async route=>{room.status='cancelled';room.phase='cancelled';room.awaiting_schedule=false;room.can_cancel=false;await route.fulfill({json:room});});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/rooms');
    await page.getByLabel('Ситуация переговоров').fill(room.request_text);
    await page.getByLabel('Желаемый результат').fill('Согласовать бюджет');
    await page.getByRole('button',{name:'12:30',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:`../.cache/booking-qa/calendar-${width}.png`});
    await page.getByRole('button',{name:'12:30',exact:true}).click();
    await page.getByRole('button',{name:'Забронировать время →',exact:true}).click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();
    assert.ok((await dialog.innerText()).includes('12:30'));
    await dialog.getByRole('button',{name:'Отправить другу',exact:true}).click();
    await dialog.getByRole('combobox').selectOption('777');
    await dialog.getByRole('button',{name:'Отправить приглашение',exact:true}).click();
    await page.getByText('Приглашение отправлено в чат и уведомления друга.').waitFor();assert.ok(invited);
    await page.screenshot({path:`../.cache/booking-qa/booking-${width}.png`});
    await dialog.getByRole('button',{name:'Посмотреть запись →'}).click();
    await page.getByRole('heading',{name:'26 сентября в 12:30 МСК'}).waitFor();
    assert.equal(await page.locator('video').count(),0);
    await page.getByRole('button',{name:'Мои записи в профиле'}).click();
    const section=page.locator('.profile-bookings');await section.getByText('Согласовать бюджет проекта',{exact:true}).waitFor();
    assert.equal(await section.getByRole('link',{name:'Войти во встречу'}).count(),0);
    await section.scrollIntoViewIfNeeded();await page.screenshot({path:`../.cache/booking-qa/profile-${width}.png`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await section.getByRole('button',{name:'Отменить запись',exact:true}).click();
    await section.getByRole('button',{name:'Да, отменить',exact:true}).click();
    await section.getByText('Предстоящих встреч нет.').waitFor();
    assert.deepEqual(errors,[]);
    await context.close();console.log(`Booking/profile ${width}: passed`);
  }
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  await context.route('**/api/rooms/preview/invite-test',r=>r.fulfill({json:{id:999,code:'invite-test',mode:'human',host_name:'Организатор',scenario:{title:'Тест приглашения',public_context:'Согласовать условия'},scheduled_at:'2026-09-26T09:30:00Z',duration_minutes:15,available_roles:[]}}));
  await page.goto(base+'/rooms?code=invite-test');
  await page.waitForURL('**/login?next=*');
  await page.locator('.arena-auth-submit').click();
  await page.waitForURL('**/rooms?code=invite-test');
  await page.getByText('Тест приглашения',{exact:true}).waitFor();
  console.log('Invitation survives login: passed');
  const login=await context.request.post(base+'/api/auth/login',{data:{username:'admin',password:'admin'}});
  const auth=await login.json();
  await page.evaluate(token=>localStorage.setItem('arena_token',token),auth.access_token);
  await page.goto(base+'/admin');
  await page.getByRole('heading',{name:'Люди и результаты'}).waitFor();
  await page.screenshot({path:'../.cache/booking-qa/admin-1440.png'});
  await page.setViewportSize({width:390,height:950});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'../.cache/booking-qa/admin-390.png'});
  console.log('Live admin overview and mobile layout: passed');
  await context.close();
} finally {await browser.close();}
