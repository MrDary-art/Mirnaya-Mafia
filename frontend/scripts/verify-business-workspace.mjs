import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
const base=process.env.ARENA_PREVIEW_URL||"http://127.0.0.1:5175";
const password=process.env.ARENA_QA_PASSWORD;
assert(password,"ARENA_QA_PASSWORD must point to disposable fixture credentials.");
const output=process.env.ARENA_QA_OUTPUT||".cache/business-qa";
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.ARENA_CHROME_PATH||"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",args:["--use-angle=swiftshader"]});
const errors=[],checks=[];
async function check(name,fn){await fn();checks.push(name);console.log("PASS "+name);}
function listen(page){page.on("pageerror",e=>errors.push(e.message));}
try{
 const publicContext=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce"});
 const p=await publicContext.newPage();listen(p);
 await check("public landing desktop + mobile",async()=>{
   await p.goto(base+"/business");await p.getByRole("heading",{name:/Договариваться/}).waitFor();
   await p.screenshot({path:output+"/landing-desktop.png",fullPage:true});
   await p.setViewportSize({width:768,height:1024});await p.screenshot({path:output+"/landing-tablet.png",fullPage:true});
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await p.setViewportSize({width:390,height:844});await p.screenshot({path:output+"/landing-mobile.png",fullPage:true});
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await p.setViewportSize({width:1440,height:1000});
 });
 await check("lead is actually persisted",async()=>{
  await p.getByLabel("Ваше имя",{exact:true}).fill("Проверка интерфейса");await p.getByLabel("Компания",{exact:true}).fill("Учебный запрос");
  await p.getByLabel("Рабочая почта").fill("business-qa-"+Date.now()+"@example.com");
  await p.getByLabel("Задача команды").fill("Проверочный запрос в отдельной тестовой базе.");
  await p.getByLabel("Согласен на обработку",{exact:false}).check();
  await p.locator("#business-contact form").getByRole("button",{name:"Запросить демонстрацию"}).click();
  await p.getByRole("heading",{name:"Запрос сохранён"}).waitFor();
 });
 const result=await p.request.post(base+"/api/auth/login",{data:{username:"qa-business-owner",password}});
 assert.equal(result.status(),200);const owner=await result.json();
 const orgs=await (await p.request.get(base+"/api/company/context",{headers:{Authorization:"Bearer "+owner.access_token}})).json();
 const company=orgs.company.id;
 let browserOwnerToken;
 await check("corporate login routes to requested workspace",async()=>{
   await p.goto(base+"/business/login?next="+encodeURIComponent("/business/"+company+"/overview"));
   await p.getByLabel("Логин",{exact:true}).fill("qa-business-owner");await p.getByLabel("Пароль",{exact:true}).fill(password);await p.locator(".arena-auth-submit").click();
   await p.waitForURL("**/business/"+company+"/overview");await p.locator(".business-sidebar").waitFor();
   browserOwnerToken=await p.evaluate(()=>localStorage.getItem("arena_token"));
   await p.screenshot({path:output+"/owner-desktop.png",fullPage:true});
   await p.setViewportSize({width:390,height:844});await p.screenshot({path:output+"/owner-mobile.png",fullPage:true});
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await p.getByRole("button",{name:"Открыть корпоративную навигацию"}).click();await p.locator(".business-sidebar.is-open").waitFor();
   assert(await p.locator(".business-sidebar").evaluate(el=>el.contains(document.activeElement)));
   await p.keyboard.press("Shift+Tab");assert(await p.locator(".business-sidebar").evaluate(el=>el.contains(document.activeElement)));
   await p.keyboard.press("Escape");await p.getByRole("button",{name:"Открыть корпоративную навигацию"}).click();
   await p.getByRole("button",{name:"Закрыть меню",exact:true}).click();await p.setViewportSize({width:1440,height:1000});
 });
 await check("multi-company selector uses exact tenant",async()=>{
   const other=orgs.companies.find(c=>c.status==="ACTIVE"&&c.company_id!==company);
   assert(other);await p.getByLabel("Активная компания",{exact:true}).selectOption(String(other.company_id));
   await p.waitForURL("**/business/"+other.company_id+"/overview");await p.getByRole("heading",{name:"Обзор",exact:true}).waitFor();
   await p.getByLabel("Активная компания",{exact:true}).selectOption(String(company));
   await p.waitForURL("**/business/"+company+"/overview");
 });
 await check("personal routes and legacy company survive",async()=>{
  for(const path of ["/company","/app","/ai","/rooms","/scenarios","/training","/profile","/analytics"]){
   await p.goto(base+path);await p.locator("h1").first().waitFor({timeout:25000});
   await p.waitForTimeout(180);
   assert(!await p.getByText("setMoreOpen is not defined",{exact:false}).count());
  }
 });
 await check("invitation survives registration and requires acceptance",async()=>{
  const response=await p.request.post(base+"/api/company/"+company+"/invitation-links",{headers:{Authorization:"Bearer "+owner.access_token},data:{corporate_role:"EMPLOYEE",job_title:"Участник теста",expires_in_days:1}});
  assert.equal(response.status(),200);const invitation=await response.json();
  const c=await browser.newContext({viewport:{width:1100,height:850},reducedMotion:"reduce"}),guest=await c.newPage();listen(guest);
  await guest.goto(base+"/business/register?invitation="+encodeURIComponent(invitation.token));
  const suffix=Date.now();
  await guest.getByLabel("ФИО",{exact:true}).fill("Приглашённый сотрудник");
  await guest.getByLabel("Никнейм",{exact:true}).fill("qa-invite-public-"+suffix);
  await guest.getByLabel("Логин",{exact:true}).fill("qa-invite-login-"+suffix);
  await guest.getByLabel("Пароль",{exact:true}).fill(password);await guest.locator(".arena-auth-submit").click();
  await guest.waitForURL("**/business/workspaces?invitation=*");await guest.getByRole("button",{name:"Подтвердить вступление"}).click();
  await guest.waitForURL("**/business/"+company+"/overview");await guest.locator(".business-shell").waitFor();
  await guest.goto(base+"/business/"+company+"/analytics");await guest.getByRole("heading",{name:"Раздел недоступен"}).waitFor();
  await c.close();
 });
 await check("public demo role switch and original session restore",async()=>{
  await p.goto(base+"/business/demo");await p.getByRole("button",{name:"Открыть учебный кабинет"}).click();
  await p.locator(".business-demo-toolbar").waitFor({timeout:20000});
  const demoUrl=p.url();assert(!demoUrl.includes("/business/"+company+"/"));
  await p.getByLabel("Роль в демо").selectOption({index:3});await p.waitForLoadState("domcontentloaded");await p.getByRole("heading",{name:"Моя главная",exact:true}).waitFor({timeout:20000});
  await p.screenshot({path:output+"/demo-employee.png",fullPage:true});
  await p.locator(".business-demo-toolbar").getByRole("button",{name:"Завершить демо"}).click();await p.waitForURL(base+"/business");
  const restored=await p.evaluate(()=>localStorage.getItem("arena_token"));assert(restored === browserOwnerToken,"Demo must restore the actual pre-demo browser session.");
 });
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({checks,pageErrors:errors,screenshotDirectory:output},null,2));
 await writeFile(output+"/root-smoke.json",JSON.stringify({checks,pageErrors:errors},null,2));
 await publicContext.close();
} finally {await browser.close();}
