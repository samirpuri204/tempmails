import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:3000", {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page
  .getByRole("textbox", { name: "YOUR TEMPORARY EMAIL", exact: true })
  .waitFor();
await page.waitForFunction(
  () => document.querySelector(".address-line input")?.value.includes("@"),
  { timeout: 60000 },
);
await mkdir("docs/screenshots", { recursive: true });
await page.screenshot({ path: "docs/screenshots/desktop.png", fullPage: true });
const accessibility = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
  .analyze();
const address = await page.locator(".address-line input").inputValue();
const body = JSON.stringify({
  provider: "custom",
  eventId: `browser-check-${Date.now()}`,
  recipient: address,
  raw: Buffer.from(
    `From: Browser Test <test@example.test>\r\nTo: ${address}\r\nSubject: Browser verification message\r\nContent-Type: text/plain\r\n\r\nVerified delivery through the signed inbound API.`,
  ).toString("base64"),
});
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac("sha256", process.env.INBOUND_SECRET)
  .update(`${timestamp}.${body}`)
  .digest("hex");
const response = await context.request.post(
  "http://localhost:3000/api/inbound",
  {
    headers: {
      "Content-Type": "application/json",
      "x-mail-timestamp": timestamp,
      "x-mail-signature": signature,
    },
    data: body,
  },
);
if (!response.ok()) throw new Error(`Inbound returned ${response.status()}`);
await page
  .getByRole("button")
  .filter({ hasText: "Browser verification message" })
  .waitFor({ timeout: 30000 });
await page
  .getByRole("button")
  .filter({ hasText: "Browser verification message" })
  .click();
await page
  .getByText("Verified delivery through the signed inbound API.")
  .waitFor();
await page.getByRole("button", { name: "Delete message", exact: true }).click();
await page.getByText("Waiting for your first email").waitFor();
await page.getByRole("button", { name: "Customize", exact: true }).click();
await page.getByRole("dialog").waitFor();
const modalAxe = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
  .analyze();
await page.keyboard.press("Escape");
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "docs/screenshots/mobile.png", fullPage: true });
const mobileAxe = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
  .analyze();
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > innerWidth,
);
await page.getByRole("button", { name: "Change theme" }).click();
await page.screenshot({
  path: "docs/screenshots/dark-mobile.png",
  fullPage: true,
});
await page.getByRole("combobox", { name: "Language" }).selectOption("ne");
await page.getByText("अलिकति गोपनीयता।", { exact: false }).waitFor();
await page.goto("http://localhost:3000/admin");
await page.getByRole("heading", { name: "Welcome back." }).waitFor();
const adminAxe = await new AxeBuilder({ page })
  .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
  .analyze();
const simplify = (r) =>
  r.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    nodes: v.nodes.map((n) => ({
      target: n.target,
      summary: n.failureSummary,
    })),
  }));
const result = {
  errors,
  overflow,
  desktop: simplify(accessibility),
  modal: simplify(modalAxe),
  mobile: simplify(mobileAxe),
  admin: simplify(adminAxe),
  flow: "creation → signed inbound → real-time arrival → read → delete; custom modal; theme; Nepali; admin gate",
};
await writeFile("docs/browser-results.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
