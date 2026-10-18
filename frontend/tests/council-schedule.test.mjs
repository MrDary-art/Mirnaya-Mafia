import test from 'node:test';
import assert from 'node:assert/strict';
import {upcomingSlots,reservationWindow,withinReservation,reservationLabel,moscowDay} from '../src/components/councilSchedule.mjs';
test('past and too-soon times disappear in Moscow time',()=>{
 const now=Date.parse('2026-10-18T15:00:00+03:00');
 const slots=['14:45','15:00','15:15','15:30'].map(time=>({time,available:true}));
 assert.deepEqual(upcomingSlots(slots,'2026-10-18',now).map(s=>s.time),['15:15','15:30']);
 assert.equal(upcomingSlots(slots,'2026-10-17',now).length,0);
});
test('a 30 minute selection covers both quarters and excludes its end',()=>{
 const window=reservationWindow('2026-10-18','15:15',30);
 assert.equal(reservationLabel(window),'15:15 — 15:45');
 assert.ok(withinReservation('2026-10-18','15:15',window));
 assert.ok(withinReservation('2026-10-18','15:30',window));
 assert.equal(withinReservation('2026-10-18','15:45',window),false);
});
test('overnight reservations include the next day and use Moscow date',()=>{
 const window=reservationWindow('2026-10-18','23:45',30);
 assert.ok(withinReservation('2026-10-19','00:00',window));
 assert.equal(withinReservation('2026-10-19','00:15',window),false);
 assert.equal(moscowDay(window.end),'2026-10-19');
 assert.match(reservationLabel(window),/23:45 — 00:15/);
 assert.match(reservationLabel(window),/19/);
});
