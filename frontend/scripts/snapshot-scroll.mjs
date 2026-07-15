import puppeteer from "puppeteer";

const URL = process.argv[2] || "http://localhost:5176/";

const browser = await puppeteer.launch({
  headless: "new",
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-cache"],
});
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setViewport({ width: 1440, height: 900 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 600));

const clicked = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll("button, [role='button'], a"));
  const target = buttons.find((el) => /设置|settings/i.test(el.textContent || ""));
  if (target) {
    target.click();
    return target.textContent?.trim() || "unknown";
  }
  return null;
});

await new Promise((r) => setTimeout(r, 700));

// Always start with scrollTop=0 so we capture the actual top of the panel.
await page.evaluate(() => {
  const aside = document.querySelector("aside[role='dialog']");
  if (aside) {
    aside.scrollTop = 0;
    // Then dispatch a small CSS-free scroll to force layout
    window.requestAnimationFrame(() => {});
  }
});
await new Promise((r) => setTimeout(r, 200));

const measurements = await page.evaluate(() => {
  const aside = document.querySelector("aside[role='dialog']");
  if (!aside) return null;
  return {
    clientHeight: aside.clientHeight,
    scrollHeight: aside.scrollHeight,
    overflowY: getComputedStyle(aside).overflowY,
    scrollTop: aside.scrollTop,
  };
});

console.log("clicked:", clicked);
console.log("measurements (scrollTop=0):", JSON.stringify(measurements));

await page.screenshot({ path: "./scripts/scroll-top.png", fullPage: false });

// Scroll to the bottom.
await page.evaluate(() => {
  const aside = document.querySelector("aside[role='dialog']");
  if (aside) aside.scrollTop = aside.scrollHeight;
});
await new Promise((r) => setTimeout(r, 200));

const bottomMeasure = await page.evaluate(() => {
  const aside = document.querySelector("aside[role='dialog']");
  return aside ? { scrollTop: aside.scrollTop } : null;
});
console.log("after scroll (scrollTop=scrollHeight):", JSON.stringify(bottomMeasure));

await page.screenshot({ path: "./scripts/scroll-bottom.png", fullPage: false });

console.log("done");
await browser.close();

