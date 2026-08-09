import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const appUrl = process.env.APP_URL || "http://127.0.0.1:4173/";
const passwordPath = path.join(root, ".admin-password");
const evidenceDir = path.join(root, "test-results", "smoke");
const workbookPath = "/Users/pranay/Downloads/Oakridge MUN 2026 - Allocation Matrix (1).xlsx";
mkdirSync(evidenceDir, { recursive: true });
const peoplePath = path.join(evidenceDir, "existing-test-people.csv");
writeFileSync(peoplePath, "Full Name,Email Address,School\nNaga Pranay Immadi,nagapranayimmadi@gmail.com,Oakridge International School\nOakridge Test Contact,cattartzz@gmail.com,Oakridge International School\n");

let firstRun = !existsSync(passwordPath);
const createAccount = firstRun || process.env.CREATE_ACCOUNT === "1";
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
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().startsWith("Blocked script execution in 'about:srcdoc'")) consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

async function axe(label) {
  const results = await new AxeBuilder({ page }).exclude(".branded-email-frame").analyze();
  const blocking = results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""));
  if (blocking.length) {
    const detail = blocking.map((violation) => ({
      id: violation.id,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    }));
    throw new Error(`${label} has blocking Axe violations: ${JSON.stringify(detail)}`);
  }
  return results.violations.map((violation) => violation.id);
}

try {
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Welcome back|Set the workspace password/ }).waitFor();
  await page.screenshot({ path: path.join(evidenceDir, "00-sign-in.png"), fullPage: true });
  const signInAxe = await axe("Sign in");
  await page.getByLabel("Workspace password").fill(password);
  if (createAccount) await page.getByRole("button", { name: /First time/ }).click();
  await page.getByRole("button", { name: createAccount ? "Create private workspace" : "Open workspace" }).click();
  await page.getByRole("heading", { name: "What needs doing?" }).waitFor({ timeout: 30_000 });
  await page.screenshot({ path: path.join(evidenceDir, "01-dashboard-desktop.png"), fullPage: true });
  const dashboardAxe = await axe("Dashboard");

  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await page.getByRole("heading", { name: "Read, route, and keep the inbox current" }).waitFor();
  await page.getByRole("button", { name: "Connect Microsoft Outlook" }).waitFor();
  await page.screenshot({ path: path.join(evidenceDir, "02-inbox-disconnected.png"), fullPage: true });
  const inboxAxe = await axe("Microsoft inbox");

  await page.getByRole("link", { name: "Contacts" }).click();
  await page.getByRole("heading", { name: "Contacts" }).waitFor();
  await page.getByText(/nagapranayimmadi@gmail\.com/).first().waitFor();
  await page.getByText(/cattartzz@gmail\.com/).first().waitFor();
  await page.screenshot({ path: path.join(evidenceDir, "02-contacts-desktop.png"), fullPage: true });
  const contactsAxe = await axe("Contacts");

  await page.getByRole("link", { name: "Email" }).click();
  await page.getByRole("heading", { name: "Write once. Make it personal." }).waitFor();
  await page.locator('.recipient-rail input[type="file"]').setInputFiles(peoplePath);
  await page.getByText(/0 new and 2 existing people are selected/).waitFor({ timeout: 30_000 });
  await page.getByText("2 selected", { exact: true }).waitFor();
  await page.frameLocator(".branded-email-frame").getByText("Oakridge MUN", { exact: true }).first().waitFor();
  await page.screenshot({ path: path.join(evidenceDir, "03-email-studio.png"), fullPage: true });
  const emailComposerAxe = await axe("Email composer");
  await page.getByRole("button", { name: "Save drafts" }).click();
  await page.getByRole("heading", { name: "Email history" }).waitFor();
  await page.getByText("An update from Oakridge MUN", { exact: true }).first().waitFor();
  await page.screenshot({ path: path.join(evidenceDir, "04-email-history.png"), fullPage: true });
  const emailAxe = await axe("Email history");

  await page.getByRole("link", { name: "Forms" }).click();
  await page.getByRole("heading", { name: "Compare preferences without the spreadsheet hunt" }).waitFor();
  const sampleButton = page.getByRole("button", { name: /Load a safe sample/ });
  if (await sampleButton.count()) {
    try {
      await sampleButton.click({ timeout: 5_000 });
      await page.getByText(/registrations imported and .* contacts synchronized/).waitFor({ timeout: 30_000 });
    } catch {
      await page.getByRole("heading", { name: "Who chose the same thing?" }).waitFor();
    }
  } else {
    await page.getByRole("heading", { name: "Who chose the same thing?" }).waitFor();
  }
  await page.getByRole("button", { name: /Round 3/ }).click();
  await page.getByText(/Third preferences are visible/).waitFor();
  await page.getByRole("button", { name: "Recommend allocations" }).click();
  await page.getByText(/1st preference|2nd preference|Needs human decision/).first().waitFor();
  await page.screenshot({ path: path.join(evidenceDir, "05-forms-preferences.png"), fullPage: true });
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
  await page.screenshot({ path: path.join(evidenceDir, "06-excel-diagnostics.png"), fullPage: true });
  const excelAxe = await axe("Excel checks");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "What needs doing?" }).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) throw new Error(`Mobile dashboard has ${overflow}px horizontal overflow.`);
  await page.screenshot({ path: path.join(evidenceDir, "07-dashboard-mobile.png"), fullPage: true });
  const mobileAxe = await axe("Mobile dashboard");

  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Email", exact: true }).click();
  await page.getByRole("heading", { name: "Write once. Make it personal." }).waitFor();
  const emailMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (emailMobileOverflow > 1) throw new Error(`Mobile Email Studio has ${emailMobileOverflow}px horizontal overflow.`);
  await page.screenshot({ path: path.join(evidenceDir, "08-email-mobile.png"), fullPage: true });
  const emailMobileAxe = await axe("Mobile Email Studio");

  if (consoleErrors.length) throw new Error(`Browser errors: ${consoleErrors.join(" | ")}`);
  console.log(JSON.stringify({
    passed: true,
    firstRun,
    screenshots: 9,
    axeNonBlockingViolations: { signInAxe, dashboardAxe, inboxAxe, contactsAxe, emailComposerAxe, emailAxe, formsAxe, excelAxe, mobileAxe, emailMobileAxe },
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
