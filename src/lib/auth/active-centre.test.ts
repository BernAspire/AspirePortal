import { describe, expect, it } from "vitest";

import { centresFrom, resolveActiveCentre, type CentreMembership } from "./active-centre";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

const aStudent: CentreMembership = { centreId: A, centreName: "Aspire Hub", role: "student" };
const aGuardian: CentreMembership = { centreId: A, centreName: "Aspire Hub", role: "guardian" };
const bStudent: CentreMembership = { centreId: B, centreName: "Bright Minds", role: "student" };
const bAdmin: CentreMembership = { centreId: B, centreName: "Bright Minds", role: "admin" };

describe("centresFrom", () => {
  it("groups roles by centre and sorts by name", () => {
    expect(centresFrom([bStudent, aStudent, aGuardian, aStudent])).toEqual([
      { centreId: A, centreName: "Aspire Hub", roles: ["student", "guardian"] },
      { centreId: B, centreName: "Bright Minds", roles: ["student"] },
    ]);
  });
});

describe("resolveActiveCentre", () => {
  it("returns none without memberships", () => {
    expect(resolveActiveCentre([], A)).toEqual({ kind: "none" });
  });

  it("picks the only centre, ignoring an unrelated cookie", () => {
    expect(resolveActiveCentre([aStudent], B)).toEqual({
      kind: "active",
      centre: { centreId: A, centreName: "Aspire Hub", roles: ["student"] },
    });
  });

  it("honours a cookie that names one of the user's centres", () => {
    const result = resolveActiveCentre([aStudent, bStudent], B);
    expect(result).toMatchObject({ kind: "active", centre: { centreId: B } });
  });

  it("asks the user to choose when the cookie is missing or not theirs", () => {
    expect(resolveActiveCentre([aStudent, bStudent], undefined).kind).toBe("choose");
    expect(
      resolveActiveCentre([aStudent, bStudent], "00000000-0000-4000-8000-0000000000ff").kind,
    ).toBe("choose");
  });

  it("applies a filter before deciding, e.g. student centres only", () => {
    const studentOnly = (c: { roles: readonly string[] }) => c.roles.includes("student");
    expect(resolveActiveCentre([aStudent, bAdmin], undefined, studentOnly)).toMatchObject({
      kind: "active",
      centre: { centreId: A },
    });
    // A cookie for a centre where the user is not a student is ignored.
    expect(resolveActiveCentre([aStudent, bAdmin], B, studentOnly)).toMatchObject({
      kind: "active",
      centre: { centreId: A },
    });
    expect(resolveActiveCentre([bAdmin], B, studentOnly)).toEqual({ kind: "none" });
  });
});
