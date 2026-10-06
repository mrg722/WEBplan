// Run with PLAYWRIGHT_MODULE pointing at an installed Playwright package and a local server.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const base = process.env.TEST_BASE_URL || 'http://localhost:4173';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(base)) throw Error('Use only a local test server');
(async () => {
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 const page=await context.newPage(), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());
 const record=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('plan20-data-v2')));
 const click=selector=>page.locator(selector+':visible').last().click();
 const screenshot=async name=>{if(process.env.TEST_SCREENSHOTS){fs.mkdirSync(process.env.TEST_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.TEST_SCREENSHOTS,name+'.png'),fullPage:true});}};
 try {
  await page.goto(base+'/?date=2026-10-05');
  await click('[data-view=planning]');
  assert.equal(await page.locator('[data-action=mood-date]').count(),0);
  assert.equal(await page.locator('.planner-mood-summary').count(),7);
  assert.equal(await page.locator('.top-notes-btn').count(),1);
  await click('[data-view=day]');
  assert.equal(await page.locator('.mobile-menu').count(),0);
  assert.match(await page.locator('.mobile-brand').innerText(),/Cree en ti/);
  await click('[data-action=nonneg-outcome][data-id=default-sleep]');
  await page.locator('[data-sleep-hours]').selectOption('7.5');
  await page.locator('[data-nonneg-notify=default-sleep]').last().uncheck();
  await click('[data-action=sleep-hours-save]');
  assert.match(await page.locator('[data-action=nonneg-outcome][data-id=default-sleep]').innerText(),/7.5 h/);
  assert.equal((await record()).days['2026-10-05'].sleepMinutes,450);
  assert.equal((await record()).nonNegotiables.find(n=>n.id==='default-sleep').reminders['2026-10-05'].enabled,false);
  await page.locator('.training-nonneg summary').click();await page.locator('[data-training-choice]').selectOption('default-training-3');
  await click('[data-action=nonneg-outcome][data-id=default-training-3]');await click('[data-action=outcome-save][data-value=missed]');
  assert.equal((await record()).nonNegotiables.find(n=>n.id==='default-training-3').outcomes['2026-10-05'],'missed');
  await click('[data-action=mood][data-mood=Bien]');
  await page.locator('[data-field=energy]').fill('0');
  await page.locator('[data-field=energy]').dispatchEvent('change');
  await page.locator('[data-reflection=title]').fill('Lunes de prueba');
  await page.locator('[data-reflection=notes]').fill('Reflexión guardada por fecha');
  await click('[data-action=save-day]');
  let d=await record();assert.equal(d.days['2026-10-05'].energy,0);assert.equal(d.days['2026-10-05'].reflection.title,'Lunes de prueba');assert.ok(d.days['2026-10-05'].savedAt);
  await click('[data-action=picker-open]');
  await click('[data-type=task-new]');
  assert.equal(await page.locator('[data-form=noDate]').isChecked(),false);
  await page.locator('[data-form=title]').fill('Estudiar estadística');
  await page.locator('[data-form=time]').fill('09:00');
  await click('[data-action=modal-save]');
  d=await record();assert.equal(d.tasks.length,1);assert.equal(d.tasks[0].date,'2026-10-05');
  await click('[data-view=day]');
  await page.locator('[data-task-check]').check();
  assert.equal(await page.locator('.task-status-control').first().innerText(),'Listo');
  await page.locator('.task-menu summary').click();
  await click('[data-action=task-repeat]');
  await click('[data-action=repeat-rest]');
  await click('[data-action=repeat-save]');
  d=await record();assert.equal(d.tasks.length,7);assert.ok(d.tasks.every(t=>t.date<='2026-10-11'));assert.equal(d.tasks.filter(t=>t.completed).length,1);
  await page.locator('[data-date-select]').fill('2026-10-06');await page.locator('[data-date-select]').dispatchEvent('change');
  assert.equal(await page.locator('[data-task-check]').count(),1);assert.equal(await page.locator('[data-task-check]').isChecked(),false);
  await page.locator('.task-menu summary').click();await click('[data-action=modal][data-type=task-edit]');
  await page.locator('[data-form=title]').fill('Copia independiente');await click('[data-action=modal-save]');
  d=await record();assert.equal(d.tasks.find(t=>t.date==='2026-10-05').title,'Estudiar estadística');
  await page.locator('.task-menu summary').click();await click('[data-action=task-unassign]');
  assert.equal(await page.locator('[data-task-check]').count(),0);
  await click('[data-action=notes-history]');assert.equal(await page.locator('.note-history-item').count(),1);
  await click('[data-action=note-toggle]');assert.match(await page.locator('.note-history-body').innerText(),/Reflexión guardada/);
  await click('[data-action=go-date]');await page.locator('[data-date-select]').fill('2026-10-12');await page.locator('[data-date-select]').dispatchEvent('change');
  assert.equal(await page.locator('[data-task-check]').count(),0);assert.equal(await page.locator('[data-reflection=notes]').inputValue(),'');
  await page.locator('[data-date-select]').fill('2026-10-05');await page.locator('[data-date-select]').dispatchEvent('change');
  await screenshot('day');
  for(const width of [320,360,375,390,412,430]){
   await page.setViewportSize({width,height:844});
   for(const view of ['planning','day','week','month']){
    await click('[data-page=plan]');await click('[data-view='+view+']');
    const sizes=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));assert.ok(sizes.scroll<=sizes.width,`${view} overflows at ${width}: ${sizes.scroll}`);
    assert.equal(await page.locator('.bottom-nav-item').count(),5);
    if(view==='planning'){const box=await page.locator('.planner-day-card').last().boundingBox();assert.ok(box.width>width*.8);}
   }
   await screenshot('month-'+width);
  }
  for(const width of [768,1280]){await page.setViewportSize({width,height:900});for(const view of ['planning','day','week','month']){await click('[data-page=plan]');await click('[data-view='+view+']');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${view} desktop overflow ${width}`);}}
  await page.setViewportSize({width:390,height:844});
  for(const route of ['goals','progress','insights','settings']){await click('[data-page='+route+']');assert.ok((await page.locator('.content-wrap').innerText()).length>20);}
  await click('[data-page=progress]');await click('[data-period=month]');assert.match(await page.locator('.mood-history').innerText(),/Bien/);await screenshot('progress');
  await click('[data-page=plan]');await screenshot('planning');
  await page.reload();d=await record();assert.equal(d.days['2026-10-05'].reflection.title,'Lunes de prueba');assert.equal(d.tasks.length,7);
  await click('[data-action=notes-history]');await click('[data-action=note-toggle]');await click('[data-action=delete-note]');assert.equal(await page.locator('.note-history-item').count(),0);d=await record();assert.equal(d.days['2026-10-05'].mood,'Bien');
  const offline=await browser.newContext({viewport:{width:390,height:844}}),op=await offline.newPage();
  await op.goto(base+'/?date=2026-10-05');await op.evaluate(()=>navigator.serviceWorker.ready);await op.reload();
  await offline.setOffline(true);await op.reload();assert.equal(await op.locator('[data-action=save-day]').count(),1);await offline.close();
  assert.deepEqual(errors,[]);console.log('PASS: 6 mobile widths + tablet/desktop; mood, energy 0, notes save/delete, tasks create/check/repeat/edit/unassign, week isolation, reload persistence and PWA offline.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
