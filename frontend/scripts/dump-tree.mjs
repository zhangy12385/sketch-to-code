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
await new Promise((r) => setTimeout(r, 800));

const tree = await page.evaluate(() => {
  const aside = document.querySelector("aside[role='dialog']");
  if (!aside) return null;
  let depth = 0;
  const walk = (node, lines) => {
    if (!node || depth > 6) return;
    depth++;
    const tag = node.nodeType === 1 ? node.tagName : `#text(${node.textContent?.trim().slice(0, 40) || ""})`;
    const cr = node.nodeType === 1 ? node.getBoundingClientRect() : null;
    const cls = node.className && typeof node.className === "string" ? node.className.slice(0, 60) : "";
    lines.push(`${"  ".repeat(depth)}<${tag}${cls ? "  " + cls : ""}> x=${cr?.x ?? "-"} y=${cr?.y ?? "-"} w=${cr?.width ?? "-"} h=${cr?.height ?? "-"}`);
    if (node.childNodes) for (const child of Array.from(node.childNodes)) walk(child, lines);
    depth--;
  };
  const lines = [];
  walk(aside, lines);
  return lines.slice(0, 25).join("\n");
});

console.log(tree);
await browser.close();
