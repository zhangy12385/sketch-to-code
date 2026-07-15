import puppeteer from "puppeteer";

const URL = "http://localhost:5173/";
const browser = await puppeteer.launch({
  headless: "new",
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 600));

const clicked = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll("button, [role='button'], a"));
  const target = buttons.find((el) => /设置|settings/i.test(el.textContent || ""));
  if (target) { target.click(); return target.textContent?.trim() || "unknown"; }
  return null;
});
await new Promise((r) => setTimeout(r, 700));

// Toggle the image-generation switch off
await page.evaluate(() => {
  const sw = document.getElementById("image-generation");
  if (sw) sw.click();
});
await new Promise((r) => setTimeout(r, 500));

// Scroll to show the image generation card
await page.evaluate(() => {
  const aside = document.querySelector("aside[role='dialog']");
  if (aside) {
    const replicate = document.getElementById("replicate-api-key");
    if (replicate) {
      replicate.scrollIntoView({ block: "center" });
    } else {
      // No replicate field — scroll to image generation section
      const cards = Array.from(document.querySelectorAll("h2"));
      const imgHeader = cards.find((h) => h.textContent === "图像生成");
      if (imgHeader) imgHeader.scrollIntoView({ block: "start" });
    }
  }
});
await new Promise((r) => setTimeout(r, 300));

await page.screenshot({ path: "./scripts/settings-toggle-off.png", fullPage: false });
const replicateVisible = await page.evaluate(() => !!document.getElementById("replicate-api-key"));
console.log("clicked:", clicked);
console.log("replicate input visible:", replicateVisible);
await browser.close();
