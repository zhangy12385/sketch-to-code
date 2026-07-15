import puppeteer from "puppeteer";

const browser = await puppeteer.launch({
  headless: "new",
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto("http://localhost:5176/", { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 600));
await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll("button, [role='button'], a"));
  const t = buttons.find((el) => /设置|settings/i.test(el.textContent || ""));
  if (t) t.click();
});
await new Promise((r) => setTimeout(r, 600));

const dump = await page.evaluate(() => {
  const aside = document.querySelector("aside[role='dialog']");
  if (!aside) return { error: "no aside" };
  const r = aside.getBoundingClientRect();
  return {
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    clientHeight: aside.clientHeight,
    scrollHeight: aside.scrollHeight,
    scrollTop: aside.scrollTop,
    overflowY: getComputedStyle(aside).overflowY,
    childInfo: Array.from(aside.children).map((c) => {
      const cr = c.getBoundingClientRect();
      const cs = getComputedStyle(c);
      return {
        tag: c.tagName,
        cls: c.className,
        rect: { x: cr.x, y: cr.y, w: cr.width, h: cr.height },
        scrollHeight: c.scrollHeight,
        overflowY: cs.overflowY,
      };
    }),
    h1Text: aside.querySelector("h1")?.textContent || null,
    h1Rect: aside.querySelector("h1")?.getBoundingClientRect() || null,
  };
});

console.log(JSON.stringify(dump, null, 2));
await browser.close();
