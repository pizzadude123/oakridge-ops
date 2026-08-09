export type StaffRole = "administrator" | "experience_publisher";

export const ADMIN_EMAILS = new Set([
  "nagapranayimmadi@gmail.com",
  "nagapranay_immadi@oakridge.in",
]);

function configuredPublisherEmails(): Set<string> {
  return new Set(
    (process.env.OAKRIDGE_EB_PUBLISHER_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLocaleLowerCase())
      .filter(Boolean),
  );
}

export function staffRoleForEmail(rawEmail: string | undefined): StaffRole | null {
  const email = (rawEmail ?? "").trim().toLocaleLowerCase();
  if (ADMIN_EMAILS.has(email)) return "administrator";
  if (configuredPublisherEmails().has(email)) return "experience_publisher";
  return null;
}
