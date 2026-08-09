import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const appUrl = process.env.APP_URL || "http://127.0.0.1:4173/";
const appOrigin = new URL(appUrl);
if (appOrigin.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(appOrigin.hostname)) {
  throw new Error("The destructive smoke workflow is restricted to a loopback development frontend.");
}
const passwordPath = path.join(root, ".admin-password");
const evidenceDir = path.join(root, "test-results", "smoke");
const workbookPath = "/Users/pranay/Downloads/Oakridge MUN 2026 - Allocation Matrix (1).xlsx";
const registrationFixturePath = path.join(root, "public", "Oakridge-MUN-Registration-Test.xlsx");
const emailImagePath = path.join(root, "public", "oakridge-logo.png");
const exerciseEmailImage = process.env.SKIP_EMAIL_IMAGE_UPLOAD !== "1";
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
let emailImageNavigationCleanupExercised = false;
let createdTestCrisis = false;
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

async function waitForStorageDeletion(url) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await context.request.get(url);
    if ([404, 410].includes(response.status())) return;
    if (!response.ok()) throw new Error(`Email image cleanup returned unexpected HTTP ${response.status()}.`);
    await page.waitForTimeout(250);
  }
  throw new Error("An abandoned email image remained available after leaving Email Studio.");
}

try {
  await page.goto(appUrl, { waitUntil: "networkidle" });
  const runtimeConvexUrl = await page.evaluate(() => document.documentElement.dataset.convexUrl ?? "");
  if (!runtimeConvexUrl) throw new Error("The destructive smoke workflow requires a Vite development build that exposes its runtime Convex URL.");
  const runtimeConvexHost = new URL(runtimeConvexUrl).hostname;
  if (!["127.0.0.1", "localhost", "host.docker.internal"].includes(runtimeConvexHost)) {
    throw new Error(`The destructive smoke workflow refused the non-local Convex host ${runtimeConvexHost}.`);
  }
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
  if (exerciseEmailImage) {
    await page.getByLabel("Upload campaign images").setInputFiles(emailImagePath);
    await page.getByText("oakridge-logo.png", { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByLabel("Location for oakridge-logo.png").selectOption("body");
    await page.getByLabel("Scale for oakridge-logo.png").selectOption("compact");
    await page.getByLabel("Alignment for oakridge-logo.png").selectOption("right");
    const configuredImage = page.frameLocator(".branded-email-frame").locator('img[alt="oakridge logo"]');
    await configuredImage.waitFor();
    if (await configuredImage.getAttribute("width") !== "320") throw new Error("Email image scale did not reach the delivered HTML preview.");
    if (await configuredImage.locator("xpath=..").getAttribute("align") !== "right") throw new Error("Email image alignment did not reach the delivered HTML preview.");
    await page.screenshot({ path: path.join(evidenceDir, "03b-email-studio-image.png"), fullPage: true });
    await page.getByRole("button", { name: "Remove oakridge-logo.png" }).click();
    await page.getByText("oakridge-logo.png", { exact: true }).waitFor({ state: "detached", timeout: 30_000 });
  }
  await page.getByRole("button", { name: "Prepare drafts" }).click();
  await page.getByRole("heading", { name: "Email history" }).waitFor();
  await page.getByText("An update from Oakridge MUN", { exact: true }).first().waitFor();
  await page.screenshot({ path: path.join(evidenceDir, "04-email-history.png"), fullPage: true });
  const emailAxe = await axe("Email history");

  await page.getByRole("link", { name: "Forms" }).click();
  await page.getByRole("heading", { name: "Compare preferences without the spreadsheet hunt" }).waitFor();
  await page.locator('.file-drop input[type="file"]').setInputFiles(registrationFixturePath);
  await page.getByText(/12 registrations imported and 12 contacts synchronized/).waitFor({ timeout: 30_000 });
  await page.getByRole("heading", { name: "Demand, pressure, and fallback paths—together" }).waitFor();
  await page.getByRole("heading", { name: "DISEC", exact: true }).waitFor();
  await page.getByRole("button", { name: "Recommend allocations" }).click();
  await page.getByText(/1st preference|2nd preference|Needs human decision/).first().waitFor();
  await page.getByRole("button", { name: "Apply reviewed assignments to Contacts" }).click();
  await page.getByText(/reviewed committee assignments applied to Contacts/).waitFor({ timeout: 30_000 });
  await page.screenshot({ path: path.join(evidenceDir, "05-forms-preferences.png"), fullPage: true });
  const formsAxe = await axe("Forms");

  await page.getByRole("link", { name: "Contacts", exact: true }).click();
  await page.getByText("aanya.verma@example.com", { exact: true }).waitFor();

  await page.getByRole("link", { name: "Delegate experience" }).click();
  await page.getByRole("heading", { name: "Publish what happens beyond the committee room" }).waitFor();
  const testCrisisHeadline = "Encrypted channel from Eastern Europe has gone silent";
  if (await page.getByText(testCrisisHeadline, { exact: true }).count() === 0) {
    await page.getByLabel("Channel").selectOption("jcc");
    await page.getByLabel("Headline").fill(testCrisisHeadline);
    await page.getByLabel("Full briefing").fill("Allied monitoring posts report a coordinated communications blackout across three rail corridors. The cause is unconfirmed. Cabinet members must distinguish confirmed infrastructure loss from assumptions about hostile action before issuing directives.");
    await page.getByLabel("Affected portfolios or actors").fill("United States, Soviet Union, United Kingdom");
    await page.getByLabel("Publish immediately to delegates").check();
    await page.getByRole("button", { name: "Publish transmission" }).click();
    await page.getByText(/Update .* published/).waitFor({ timeout: 30_000 });
    createdTestCrisis = true;
  }
  await page.screenshot({ path: path.join(evidenceDir, "05b-experience-manager.png"), fullPage: true });
  const experienceAxe = await axe("Experience manager");

  await page.goto(`${appUrl}#/committees/disec`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "DISEC", exact: true }).waitFor();
  await page.getByRole("button", { name: /Local civilian ownership/ }).click();
  await page.getByText("1/3 decisions locked", { exact: true }).waitFor();
  const disecAxe = await axe("Public DISEC");
  const disecOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (disecOverflow > 1) throw new Error(`DISEC has ${disecOverflow}px horizontal overflow.`);

  await page.goto(`${appUrl}#/committees/armageddon`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "ARMAGEDDON", exact: true }).waitFor();
  const armageddonAxe = await axe("Public Armageddon");

  await page.goto(`${appUrl}#/crisis/jcc-cold-war`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: testCrisisHeadline }).waitFor({ timeout: 30_000 });
  await page.getByText("NOT A REAL-WORLD ALERT", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(evidenceDir, "05c-jcc-public-feed.png"), fullPage: true });
  const crisisAxe = await axe("Public JCC crisis feed");

  if (createdTestCrisis) {
    await page.goto(`${appUrl}#/experience`, { waitUntil: "networkidle" });
    const fixtureRow = page.locator(".crisis-update-history article").filter({ hasText: testCrisisHeadline });
    page.once("dialog", (dialog) => void dialog.accept());
    await fixtureRow.getByRole("button", { name: "Delete", exact: true }).click();
    await fixtureRow.waitFor({ state: "detached" });
  }

  await page.goto(`${appUrl}#/excel`, { waitUntil: "networkidle" });
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
  await page.goto(`${appUrl}#/committees/disec`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "DISEC", exact: true }).waitFor();
  await page.waitForTimeout(1_600);
  const disecMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (disecMobileOverflow > 1) throw new Error(`Mobile DISEC has ${disecMobileOverflow}px horizontal overflow.`);
  await page.screenshot({ path: path.join(evidenceDir, "07a-disec-mobile.png"), fullPage: true });
  const disecMobileAxe = await axe("Mobile DISEC");

  await page.goto(`${appUrl}#/committees/armageddon`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "ARMAGEDDON", exact: true }).waitFor();
  await page.waitForTimeout(1_600);
  const armageddonMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (armageddonMobileOverflow > 1) throw new Error(`Mobile Armageddon has ${armageddonMobileOverflow}px horizontal overflow.`);
  await page.screenshot({ path: path.join(evidenceDir, "07b-armageddon-mobile.png"), fullPage: true });
  const armageddonMobileAxe = await axe("Mobile Armageddon");

  await page.goto(`${appUrl}#/crisis/jcc-cold-war`, { waitUntil: "networkidle" });
  await page.getByText("NOT A REAL-WORLD ALERT", { exact: true }).waitFor();
  await page.waitForTimeout(1_600);
  const crisisMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (crisisMobileOverflow > 1) throw new Error(`Mobile JCC crisis feed has ${crisisMobileOverflow}px horizontal overflow.`);
  await page.screenshot({ path: path.join(evidenceDir, "07c-jcc-mobile.png"), fullPage: true });
  const crisisMobileAxe = await axe("Mobile JCC crisis feed");

  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "What needs doing?" }).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) throw new Error(`Mobile dashboard has ${overflow}px horizontal overflow.`);
  await page.screenshot({ path: path.join(evidenceDir, "07-dashboard-mobile.png"), fullPage: true });
  const mobileAxe = await axe("Mobile dashboard");

  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Email", exact: true }).click();
  await page.getByRole("heading", { name: "Write once. Make it personal." }).waitFor();
  await page.waitForTimeout(250);
  const mobileNavigation = await page.locator(".sidebar").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { right: rect.right, scrimVisible: Boolean(document.querySelector(".nav-scrim")) };
  });
  if (mobileNavigation.right > 1 || mobileNavigation.scrimVisible) throw new Error("Mobile navigation did not close after route selection.");
  const emailMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (emailMobileOverflow > 1) throw new Error(`Mobile Email Studio has ${emailMobileOverflow}px horizontal overflow.`);
  await page.screenshot({ path: path.join(evidenceDir, "08-email-mobile.png") });
  const emailMobileAxe = await axe("Mobile Email Studio");
  await page.locator(".preview-panel").scrollIntoViewIfNeeded();
  await page.frameLocator(".branded-email-frame").getByText("Oakridge MUN", { exact: true }).first().waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(evidenceDir, "09-email-preview-mobile.png") });

  if (exerciseEmailImage) {
    await page.getByLabel("Upload campaign images").setInputFiles(emailImagePath);
    await page.getByText("oakridge-logo.png", { exact: true }).waitFor({ timeout: 30_000 });
    const abandonedImageUrl = await page.frameLocator(".branded-email-frame").locator('img[alt="oakridge logo"]').getAttribute("src");
    if (!abandonedImageUrl) throw new Error("The uploaded email image URL was unavailable for cleanup verification.");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("link", { name: "Home", exact: true }).click();
    await page.getByRole("heading", { name: "What needs doing?" }).waitFor();
    await waitForStorageDeletion(abandonedImageUrl);
    emailImageNavigationCleanupExercised = true;
  }

  if (consoleErrors.length) throw new Error(`Browser errors: ${consoleErrors.join(" | ")}`);
  console.log(JSON.stringify({
    passed: true,
    firstRun,
    screenshots: exerciseEmailImage ? 17 : 16,
    emailImageExercised: exerciseEmailImage,
    emailImageNavigationCleanupExercised,
    axeNonBlockingViolations: { signInAxe, dashboardAxe, inboxAxe, contactsAxe, emailComposerAxe, emailAxe, formsAxe, experienceAxe, disecAxe, armageddonAxe, crisisAxe, excelAxe, disecMobileAxe, armageddonMobileAxe, crisisMobileAxe, mobileAxe, emailMobileAxe },
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
