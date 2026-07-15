import puppeteer from "puppeteer";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const DOCS = path.join(ROOT, "docs");
const TARGET = process.argv[2] || "http://localhost:5173/";

await mkdir(DOCS, { recursive: true });

const browser = await puppeteer.launch({
  headless: "new",
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const shoot = async (page, name, opts = {}) => {
  const file = path.join(DOCS, name);
  await page.screenshot({ path: file, ...opts });
  console.log("saved:", file);
};

const clickByText = async (page, text) => {
  const ok = await page.evaluate((t) => {
    const targets = Array.from(
      document.querySelectorAll("button, a, [role='button']"),
    );
    const match = targets.find((el) => {
      const own = (el.textContent || "").trim();
      return own === t || own.startsWith(t);
    });
    if (match) {
      match.click();
      return true;
    }
    return false;
  }, text);
  if (!ok) throw new Error("button not found: " + text);
  await new Promise((r) => setTimeout(r, 600));
};

const setTheme = async (page, mode) => {
  await page.evaluate((m) => {
    const html = document.documentElement;
    const body = document.body;
    if (m === "dark") {
      html.classList.add("dark");
      body.classList.add("dark");
    } else {
      html.classList.remove("dark");
      body.classList.remove("dark");
    }
  }, mode);
  await new Promise((r) => setTimeout(r, 250));
};

async function openPage({ viewport, theme }) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(TARGET, { waitUntil: "networkidle2", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1000));
  await setTheme(page, theme);
  return page;
}

// 1) Empty-state hero — desktop dark.
{
  const page = await openPage({
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    theme: "dark",
  });
  await shoot(page, "preview.png");
  await page.close();
}

// 2) Empty-state hero — desktop light.
{
  const page = await openPage({
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    theme: "light",
  });
  await shoot(page, "preview-light.png");
  await page.close();
}

// 3) Settings drawer (light, custom Provider form visible).
{
  const page = await openPage({
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    theme: "light",
  });
  await clickByText(page, "设置");
  await shoot(page, "settings.png");
  await page.close();
}

// 4) Settings drawer — dark.
{
  const page = await openPage({
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    theme: "dark",
  });
  await clickByText(page, "设置");
  await shoot(page, "settings-dark.png");
  await page.close();
}

// 5) New Project modal (screenshot / URL / record input modes).
{
  const page = await openPage({
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    theme: "light",
  });
  await clickByText(page, "新建项目");
  await shoot(page, "input.png");
  await page.close();
}

// 6) Mobile viewport (390x844) of home view.
{
  const page = await openPage({
    viewport: { width: 390, height: 844, deviceScaleFactor: 2 },
    theme: "light",
  });
  await shoot(page, "preview-mobile.png");
  await page.close();
}

await browser.close();
console.log("done.");