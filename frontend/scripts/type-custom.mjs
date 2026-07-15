import puppeteer from "puppeteer";

const browser = await puppeteer.launch({
  headless: "new",
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 600));

const clicked = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll("button, [role='button'], a"));
  const target = buttons.find((el) => /设置|settings/i.test(el.textContent || ""));
  if (target) target.click();
  return target?.textContent?.trim() || "unknown";
});
await new Promise((r) => setTimeout(r, 700));

// Type a custom unknown model
const input = await page.$("#code-generation-model");
await input.click({ clickCount: 3 });
await input.type("my-custom-model-x");
await new Promise((r) => setTimeout(r, 400));

await page.screenshot({ path: "./scripts/settings-unknown-model.png", fullPage: false });
await browser.close();
