import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const passwordPath = path.join(root, ".admin-password");
const evidenceDir = path.join(root, "test-results", "smoke");
const workbookPath = "/Users/pranay/Downloads/Oakridge MUN 2026 - Allocation Matrix (1).xlsx";
mkdirSync(evidenceDir, { recursive: true });

let firstRun = !existsSync(passwordPath);
if (firstRun) {
  writeFileSync(passwordPath, `${randomBytes(24).toString("base64url")}Aa1!
`, { mode: 0o600 });
  chmodSync(passwordPath, 0o600);
}
const password = readFileSync(passwordPath, "utf8").trim();
if (password.length < 12) throw new Error("Protected workspace password file is invalid.");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));

async function axe(label) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""));
  if (blocking.length) {
    const detail = blocking.map((violation) => ({
      id: violation.id,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    }));
    throw new Error(`${label} has blocking Axe violations: ${JSON.stringify(detail)}`);
  }
  return results.violations.length;
}

try {
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await page.getByLabel("Workspace password").fill(password);
  if (firstRun) await page.getByRole("button", { name: /First time/ }).click();
  await page.getByRole("button", { name: firstRun ? "Create private workspace" : "Open workspace" }).click();
  await page.getByRole("heading", { name: "What needs doing?" }).waitFor({ timeout: 30_000 });
  await page.screenshot({ path: path.join(evidenceDir, "01-dashboard-desktop.png"), fullPage: true });
  const dashboardAxe = await axe("Dashboard");

  await page.getByRole("link", { name: "Contacts" }).click();
  await page.getByRole("heading", { name: "Contacts" }).waitFor();
  await page.getByText(/nagapranayimmadi@gmail\.com/).first().waitFor();
  await page.getByText(/cattartzz@gmail\.com/).first().waitFor();
  await page.screenshot({ path: path.join(evidenceDir, "02-contacts-desktop.png"), fullPage: true });
  const contactsAxe = await axe("Contacts");

  await page.getByRole("link", { name: "Email" }).click();
  await page.getByRole("heading", { name: "Write once. Make it personal." }).waitFor();
  await page.locator(".recipient-item").first().click();
  await page.getByRole("button", { name: "Prepare drafts" }).click();
  await page.getByRole("heading", { name: "Email history" }).waitFor();
  await page.getByText("Your Oakridge MUN allocation", { exact: true }).first().waitFor();
  await page.screenshot({ path: path.join(evidenceDir, "03-email-history.png"), fullPage: true });
  const emailAxe = await axe("Email history");

  await page.getByRole("link", { name: "Forms" }).click();
  const sampleButton = page.getByRole("button", { name: /Load a safe sample/ });
  if (await sampleButton.count()) {
    await sampleButton.click();
    await page.getByText(/registrations imported and .* contacts synchronized/).waitFor({ timeout: 30_000 });
  } else {
    await page.getByRole("heading", { name: "Who chose the same thing?" }).waitFor();
  }
  await page.getByRole("button", { name: /Round 3/ }).click();
  await page.getByText(/Third preferences are visible/).waitFor();
  await page.getByRole("button", { name: "Recommend allocations" }).click();
  await page.getByText(/1st preference|2nd preference|Needs human decision/).first().waitFor();
  await page.screenshot({ path: path.join(evidenceDir, "04-forms-preferences.png"), fullPage: true });
  const formsAxe = await axe("Forms");

  await page.getByRole("link", { name: "Excel checks" }).click();
  let hasWorkbookSummary = false;
  try {
    await page.locator(".diagnostic-summary").waitFor({ timeout: 15_000 });
    hasWorkbookSummary = true;
  } catch {
    hasWorkbookSummary = false;
  }
  if (!hasWorkbookSummary && existsSync(workbookPath)) {
    await page.locator('.file-drop input[type="file"]').setInputFiles(workbookPath);
    await page.getByText(/seats checked across .* sheets/).waitFor({ timeout: 90_000 });
  }
  if (existsSync(workbookPath)) {
    await page.getByRole("heading", { name: /workbook issues|Workbook looks clear/ }).waitFor();
  }
  await page.screenshot({ path: path.join(evidenceDir, "05-excel-diagnostics.png"), fullPage: true });
  const excelAxe = await axe("Excel checks");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "What needs doing?" }).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) throw new Error(`Mobile dashboard has ${overflow}px horizontal overflow.`);
  await page.screenshot({ path: path.join(evidenceDir, "06-dashboard-mobile.png"), fullPage: true });
  const mobileAxe = await axe("Mobile dashboard");

  if (consoleErrors.length) throw new Error(`Browser errors: ${consoleErrors.join(" | ")}`);
  console.log(JSON.stringify({
    passed: true,
    firstRun,
    screenshots: 6,
    axeNonBlockingViolations: { dashboardAxe, contactsAxe, emailAxe, formsAxe, excelAxe, mobileAxe },
    workbookExercised: existsSync(workbookPath),
    passwordFile: ".admin-password (mode 0600; value not printed)",
  }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(evidenceDir, "failure.png"), fullPage: true });
  const visibleText = await page.locator("body").innerText();
  console.error("Visible page at failure:\n" + visibleText);
  if (consoleErrors.length) console.error("Browser console/page errors:\n" + consoleErrors.join("\n"));
  throw error;
} finally {
  await browser.close();
}
