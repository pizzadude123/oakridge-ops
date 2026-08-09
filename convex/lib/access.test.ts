import { afterEach, describe, expect, it } from "vitest";
import { staffRoleForEmail } from "./access";

const originalPublishers = process.env.OAKRIDGE_EB_PUBLISHER_EMAILS;

afterEach(() => {
  if (originalPublishers === undefined) delete process.env.OAKRIDGE_EB_PUBLISHER_EMAILS;
  else process.env.OAKRIDGE_EB_PUBLISHER_EMAILS = originalPublishers;
});

describe("staffRoleForEmail", () => {
  it("keeps the fixed operations accounts as administrators", () => {
    expect(staffRoleForEmail("nagapranayimmadi@gmail.com")).toBe("administrator");
    expect(staffRoleForEmail(" NAGAPRANAY_IMMADI@OAKRIDGE.IN ")).toBe("administrator");
  });

  it("grants only the constrained publisher role to configured EB accounts", () => {
    process.env.OAKRIDGE_EB_PUBLISHER_EMAILS = "chair@example.com, crisis@example.com";
    expect(staffRoleForEmail("CHAIR@example.com")).toBe("experience_publisher");
    expect(staffRoleForEmail("crisis@example.com")).toBe("experience_publisher");
  });

  it("rejects accounts outside both lists", () => {
    process.env.OAKRIDGE_EB_PUBLISHER_EMAILS = "chair@example.com";
    expect(staffRoleForEmail("delegate@example.com")).toBeNull();
    expect(staffRoleForEmail(undefined)).toBeNull();
  });
});
