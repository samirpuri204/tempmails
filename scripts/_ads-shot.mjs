import { chromium } from "@playwright/test";
const url = process.argv[2], out = process.argv[3];
const b = await chromium.launch({ channel: "chrome", headless: true });
for (const [name, vp, mobile] of [["desktop",{width:1440,height:1000},false],["mobile",{width:390,height:844},true]]) {
  const c = await b.newContext({ viewport: vp, isMobile: mobile, deviceScaleFactor: 1 });
  const p = await c.newPage();
  const logs = [];
  p.on("console", m => { if (m.type()==="error") logs.push(m.text().slice(0,200)); });
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForFunction(() => document.querySelector(".address-line input")?.value.includes("@") || document.querySelector(".error-notice"), null, { timeout: 30000 }).catch(()=>{}); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  const info = await p.evaluate(() => ({
    h: document.documentElement.scrollHeight,
    adBoxes: [...document.querySelectorAll(".adsense-placement")].map(e => ({ label: e.getAttribute("aria-label"), top: Math.round(e.getBoundingClientRect().top), h: Math.round(e.getBoundingClientRect().height), visible: getComputedStyle(e).display !== "none" })),
    addr: document.querySelector(".address-line input")?.value,
    scripts: [...document.scripts].filter(s=>s.src && !s.src.includes("/_next/")).map(s=>s.src),
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  console.log(name, JSON.stringify(info), "console errors:", logs);
  await c.close();
}
await b.close();
