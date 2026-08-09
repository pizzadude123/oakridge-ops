import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appUrl = process.env.APP_URL || "http://127.0.0.1:4173/oakridge-ops/";
const password = readFileSync(path.join(root, ".admin-password"), "utf8").trim();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
try {
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Welcome back|Set the workspace password/ }).waitFor();
  if (await page.getByRole("heading", { name: "Welcome back" }).isVisible().catch(() => false)) {
    await page.getByLabel("Workspace password").fill(password);
    await page.getByRole("button", { name: "Open workspace" }).click();
  }
  await page.getByRole("heading", { name: "What needs doing?" }).waitFor({ timeout: 30_000 });
  let failures = 0;
  await page.route(/(?:\/oakridge-ops\/assets\/EmailPage-[^/]+\.js|\/src\/pages\/EmailPage\.tsx)/, async (route) => {
    failures += 1;
    await route.abort("failed");
  });
  await page.getByRole("link", { name: "Email", exact: true }).click();
  await page.getByRole("heading", { name: "This page was updated" }).waitFor({ timeout: 20_000 });
  const sidebarVisible = await page.getByRole("navigation", { name: "Main navigation" }).isVisible();
  if (!sidebarVisible || failures < 2) throw new Error(`Recovery proof failed: sidebar=${sidebarVisible}, failedRequests=${failures}`);
  console.log(JSON.stringify({ passed: true, failures, sidebarVisible, recovery: "This page was updated" }));
} catch (error) {
  console.error("Visible page at failure:\n" + await page.locator("body").innerText().catch(() => "<unavailable>"));
  console.error("Console errors:\n" + consoleErrors.join("\n"));
  throw error;
} finally {
  await browser.close();
}
