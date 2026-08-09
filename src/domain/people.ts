export type ImportedPerson = {
  fullName: string;
  email: string;
  school: string;
};

export type PeopleImportResult = {
  people: ImportedPerson[];
  skippedRows: number;
};

const NAME_FIELDS = new Set(["name", "fullname", "participantname", "delegatename", "studentname", "respondentname"]);
const EMAIL_FIELDS = new Set(["email", "emailaddress", "respondersemail", "responderemail", "participantemail", "delegateemail"]);
const SCHOOL_FIELDS = new Set(["school", "schoolname", "organisation", "organization", "organisationname", "organizationname", "institution"]);

function normalizedHeading(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

function valueFor(row: Record<string, unknown>, aliases: Set<string>) {
  for (const [heading, value] of Object.entries(row)) {
    if (aliases.has(normalizedHeading(heading))) return String(value ?? "").trim();
  }
  return "";
}

function nameFromEmail(email: string) {
  return email
    .split("@")[0]
    .replace(/[._+-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

export function normalizePeopleRows(rows: Record<string, unknown>[]): PeopleImportResult {
  const people: ImportedPerson[] = [];
  const emails = new Set<string>();
  let skippedRows = 0;

  for (const row of rows) {
    const email = valueFor(row, EMAIL_FIELDS).toLocaleLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || emails.has(email)) {
      skippedRows += 1;
      continue;
    }
    emails.add(email);
    people.push({
      fullName: valueFor(row, NAME_FIELDS) || nameFromEmail(email),
      email,
      school: valueFor(row, SCHOOL_FIELDS),
    });
  }

  return { people, skippedRows };
}
