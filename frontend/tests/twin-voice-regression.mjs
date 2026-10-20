// Uses the real duel UI and Web Audio decoder; native recognition and server replies are fixtures.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5174";
const wav = Buffer.alloc(44 + 1600);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(1600, 40);
const browser = await chromium.launch({ channel: process.env.TEST_BROWSER || "chrome", headless: true });
try {
  const page = await browser.newPage({viewport:{width:1440,height:960}});
  const errors = [], turns = [], replays = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("arena_token", "test-only");
    localStorage.setItem("arena_speech_enabled", "true");
    window.audioStarts = [];
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function() {
      const source = original.call(this), start = source.start.bind(source);
      source.start = (...args) => { window.audioStarts.push(source.buffer.duration); return start(...args); };
      return source;
    };
    class Recognition {
      constructor() { window.testRecognition = this; }
      start() { setTimeout(() => this.onstart?.(), 0); }
      stop() { setTimeout(() => this.onend?.(), 0); }
      abort() { this.onend?.(); }
    }
    window.SpeechRecognition = Recognition;
  });
  const reply = "Давайте обсудим условия продления.";
  const session = {id:123,status:"active",mode:"online",role:"Директор",opponent_role:"Арендодатель",goal:"Согласовать аренду",metrics:{trust:50,goal:50,control:50,eq:50},scoring:[],settings:{problem:"Продление аренды",twin_duel:{minimum_turns:5,target_score:80,source_count:20,target:{trust:80,goal:80,control:80,eq:80}}},messages:[{id:1,sender:"opponent",text:reply}]};
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({json:{id:1,username:"voice-tester",is_admin:false}});
    if (path === "/api/sessions/123") return route.fulfill({json:session});
    if (path === "/api/sessions/123/speak") {
      replays.push(route.request().postDataJSON());
      return route.fulfill({contentType:"audio/wav",body:wav});
    }
    if (path === "/api/sessions/123/turn-stream") {
      const body = route.request().postDataJSON(); turns.push(body);
      session.messages.push({id:session.messages.length+1,sender:"player",text:body.text},{id:session.messages.length+2,sender:"opponent",text:reply});
      const events = [{type:"accepted"},{type:"reply_delta",text:reply}];
      if(body.speak) events.push({type:"sentence_audio",text:reply,wav:wav.toString("base64")});
      events.push({type:"done",result:{finished:false}});
      return route.fulfill({contentType:"application/x-ndjson",body:events.map(event=>JSON.stringify(event)).join("\n")+"\n"});
    }
    if (/voice-stream|\/voice$|transcribe/.test(path)) throw new Error("Audio must not be uploaded for browser recognition");
    return route.fulfill({json:{count:0,items:[]}});
  });
  await page.goto(base+"/practice?session=123");
  const input = page.getByRole("textbox",{name:"Ваш ответ",exact:true});
  await input.fill("Предлагаю зафиксировать ставку на год.");
  await page.getByRole("button",{name:"Отправить ответ",exact:true}).click();
  await page.waitForFunction(()=>window.audioStarts.length===1);
  await page.waitForFunction(()=>!document.querySelector('textarea[aria-label="Ваш ответ"]').disabled);
  assert.equal(turns[0].speak,true);
  const mic = page.getByRole("button",{name:"Ответить голосом",exact:true});
  async function voice(text) {
    await mic.click();
    await page.getByRole("button",{name:"Отправить",exact:true}).waitFor();
    await page.evaluate(text=>{ const item=[{transcript:text}];item.isFinal=true;window.testRecognition.onresult({results:[item]}); },text);
    await page.getByRole("button",{name:"Отправить",exact:true}).click();
    await mic.waitFor();
    await page.waitForFunction(()=>!document.querySelector('textarea[aria-label="Ваш ответ"]').disabled);
  }
  await voice("Какие условия вы готовы предложить?");
  assert.equal(turns[1].text,"Какие условия вы готовы предложить?");
  assert.equal(await page.evaluate(()=>window.audioStarts.length),2);
  await page.getByRole("button",{name:"Озвучивание ответов ИИ",exact:true}).click();
  await voice("Согласуем срок действия договора.");
  assert.equal(turns[2].speak,false);
  assert.equal(await page.evaluate(()=>window.audioStarts.length),2);
  await page.getByRole("button",{name:"Озвучить последний ответ",exact:true}).click();
  await page.waitForFunction(()=>window.audioStarts.length===3);
  await page.waitForFunction(()=>!document.querySelector('textarea[aria-label="Ваш ответ"]').disabled);
  assert.deepEqual(replays,[{text:reply}]);
  assert.equal(await page.getByRole("button",{name:"Озвучивание ответов ИИ",exact:true}).getAttribute("aria-pressed"),"true");
  assert.equal(await page.locator(".conversation-log .twin-situation").count(),0);
  await page.setViewportSize({width:320,height:740});
  await mic.click();
  await page.getByRole("button",{name:"Отправить",exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole("button",{name:"Отменить",exact:true}).click();
  assert.deepEqual(errors,[]);
  console.log("Twin duel: typed/voice turns, real WAV decoding, mute, replay, mobile voice controls: OK");
} finally {await browser.close();}
