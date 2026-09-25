import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const base='http://127.0.0.1:5176', out='../.cache/exhibit-qa';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.ARENA_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=swiftshader']});
const errors=[];
try {
  for(const width of [1440,390]) {
    const context=await browser.newContext({viewport:{width,height:900}});
    const login=await context.request.post(base+'/api/auth/login',{data:{username:'demo',password:'demo'}});
    assert.equal(login.status(),200);
    const {access_token}=await login.json();
    await context.addInitScript(token=>{localStorage.setItem('arena_token',token);sessionStorage.removeItem('arena_guided_demo');},access_token);
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    const calls=[];page.on('request',r=>{if(r.url().includes('/api/rooms')) calls.push(r.url());});
    await page.goto(base+'/rooms/demo');await page.locator('.exhibit-hero').waitFor();await page.waitForTimeout(1000);
    await page.screenshot({path:`${out}/hero-${width}.png`});
    assert.equal(await page.locator('.exhibit-chapter').count(),4);
    for(const id of ['exhibit-invite','exhibit-roles','demo-practice','exhibit-report']) {
      await page.locator('#'+id).scrollIntoViewIfNeeded();await page.waitForTimeout(800);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
      if(id==='exhibit-roles') {
        await page.getByRole('radio').nth(1).check();
        assert(await page.getByRole('radio').nth(1).isChecked());
        await page.screenshot({path:`${out}/roles-${width}.png`});
      }
    }
    await page.getByRole('button',{name:'Показать пример разговора'}).click();
    await page.locator('.exhibit-bubble.reply').waitFor();await page.waitForTimeout(1000);
    await page.screenshot({path:`${out}/dialogue-${width}.png`});
    await page.getByRole('button',{name:'Два собеседования',exact:true}).click();
    assert.equal(await page.getByRole('radio').count(),1);
    await page.getByRole('heading',{name:'Почему задания одинаковые?'}).waitFor();
    await page.getByRole('button',{name:'Обсудить сроки',exact:true}).click();
    assert.equal(await page.getByRole('radio').count(),2);
    assert.equal(calls.length,0,'Exhibit never calls rooms, voice, AI or booking APIs');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.exhibit-scene').first().evaluate(el=>getComputedStyle(el).opacity),'1');
    await page.getByRole('link',{name:'Создать настоящую встречу'}).click();
    await page.waitForURL(base+'/rooms');
    await page.locator('.room-demo-entry').waitFor();
    await page.route('**/api/rooms/preview/QA-CODE',route=>route.fulfill({json:{code:'QA-CODE',mode:'human',host_name:'QA',duration_minutes:15,scenario:{title:'Поставка фруктов',public_context:'Закупка для кафе'},role_source:'gigachat',available_roles:[{id:'role_1',title:'Владелец',description:'Согласует цену'},{id:'role_2',title:'Менеджер',description:'Согласует объём'}]}}));
    await page.getByLabel('Код комнаты',{exact:true}).fill('QA-CODE');
    await page.getByRole('button',{name:'Проверить приглашение'}).click();
    await page.locator('.room-role-options').waitFor();
    await page.locator('section').filter({has:page.getByRole('heading',{name:'Войти по приглашению'})}).getByLabel('Как к вам обращаться',{exact:true}).fill('Гость');
    assert(!await page.getByRole('button',{name:'Подтвердить и войти →'}).isEnabled());
    await page.getByRole('radio',{name:/Менеджер/}).check();
    assert(await page.getByRole('button',{name:'Подтвердить и войти →'}).isEnabled());
    let sent;
    await page.route('**/api/rooms/join',route=>{sent=route.request().postDataJSON();return route.fulfill({status:409,json:{detail:'Проверка отправки роли: комнату не создаём'}});});
    await page.getByRole('button',{name:'Подтвердить и войти →'}).click();
    await page.getByText('Проверка отправки роли: комнату не создаём').waitFor();
    assert.equal(sent.role_id,'role_2');
    console.log(JSON.stringify({width,exhibitApiCalls:0,roleSelection:true,errors}));
    await context.close();
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
