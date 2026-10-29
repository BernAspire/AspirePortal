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
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "valid email" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
});

test("sign-in reports an outage instead of pretending a code was sent", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("student@example.test");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "couldn't reach" })).toBeVisible();
  await expect(page.getByLabel("Code")).toHaveCount(0);
  await expect(page.getByLabel("Email")).toHaveValue("student@example.test");
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
