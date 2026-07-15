import puppeteer from "puppeteer";

const URL = "http://localhost:5173/";

const browser = await puppeteer.launch({
  headless: "new",
  executablePath:
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));

const info = await page.evaluate(() => {
  const root = document.getElementById("root");
  return {
    rootChildren: root?.children.length ?? 0,
    title: document.title,
    bodyText: document.body.innerText.slice(0, 600).replace(/\n+/g, " | "),
    buttonCount: document.querySelectorAll("button").length,
    buttonLabels: Array.from(document.querySelectorAll("button")).slice(0, 12).map(b => b.textContent?.trim().slice(0, 30)).filter(Boolean),
    hasTextarea: !!document.querySelector("textarea"),
    hasInput: !!document.querySelector("input"),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();