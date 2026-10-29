import { expect, test } from "@playwright/test";

// These run without a real Supabase project: CI points the app at an address
// where nothing is listening, so any call to Supabase fails as an outage.

test("a signed-out visitor to the student portal is sent to sign-in and back", async ({ page }) => {
  await page.goto("/student");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fstudent$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await expect(page.locator('input[name="next"]')).toHaveValue("/student");
});

test("lesson pages also require sign-in and return to the lesson", async ({ page }) => {
  await page.goto("/student/learn/00000000-0000-4000-8000-000000000001?part=2");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fstudent%2Flearn%2F00000000-0000-4000-8000-000000000001%3Fpart%3D2$/);
});

test("sign-in ignores an off-site return address", async ({ page }) => {
  await page.goto("/sign-in?next=//evil.example");
  await expect(page.locator('input[name="next"]')).toHaveValue("/start");
});

test("sign-in rejects an invalid email without calling Supabase", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Parent or staff" }).click();
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "valid email" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
});

test("sign-in reports an outage instead of pretending a code was sent", async ({ page }) => {
  await page.goto("/sign-in?as=family");
  await page.getByLabel("Email").fill("student@example.test");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "couldn't reach" })).toBeVisible();
  await expect(page.getByLabel("Code")).toHaveCount(0);
  await expect(page.getByLabel("Email")).toHaveValue("student@example.test");
});

for (const path of ["/student/classes", "/student/tutorials", "/student/calendar", "/student/attendance", "/student/practice"]) {
  test(`signed-out visitors to ${path} are sent to sign-in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path)}$`));
  });
}

test("students see username and PIN first", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("tab", { name: "Student" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("PIN")).toHaveAttribute("type", "password");
});

test("PIN sign-in checks the form before calling Supabase", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill("tess tan");
  await page.getByLabel("PIN").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter your username" })).toBeVisible();

  await page.getByLabel("Username").fill("tess.tan");
  await page.getByLabel("PIN").fill("12");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "6 to 8 digits" })).toBeVisible();
});

test("PIN sign-in reports an outage", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill("tess.tan");
  await page.getByLabel("PIN").fill("123456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "couldn't reach" })).toBeVisible();
  await expect(page.getByLabel("Username")).toHaveValue("tess.tan");
});

test("tabs switch with the keyboard", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Student" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Parent or staff" })).toBeFocused();
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("sign-in fits a phone screen", async ({ page }) => {
  await page.goto("/sign-in");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the no-access page offers sign-out", async ({ page }) => {
  await page.goto("/no-access");
  await expect(page.getByRole("heading", { level: 1, name: "Nothing to show yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});
