import puppeteer from "puppeteer";

const URL = process.argv[2] || "http://localhost:5176/";
const OUT = process.argv[3] || "./scripts/settings.png";

const browser = await puppeteer.launch({
  headless: "new",
  executablePath:
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on("console", (msg) => {
  if (msg.type() === "error") console.error("[browser]", msg.text());
});

await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 800));

// Take a baseline screenshot of the home view.
await page.screenshot({ path: OUT.replace(".png", "-home.png"), fullPage: false });

// Try a few selectors that should be present on the home page or after a click.
const clicked = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll("button, [role='button'], a"));
  const target = buttons.find((el) => /设置|settings/i.test(el.textContent || ""));
  if (target) {
    target.click();
    return target.textContent?.trim() || "unknown";
  }
  return null;
});

console.log("clicked:", clicked);
await new Promise((r) => setTimeout(r, 800));

await page.screenshot({ path: OUT, fullPage: true });
console.log("saved:", OUT);

await browser.close();
