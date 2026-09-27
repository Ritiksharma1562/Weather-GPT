import { expect, test } from "@playwright/test";
test("live dashboard, city search, signup, save, reload and sign out", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Weather overview." }),
  ).toBeVisible();
  await expect(page.locator(".temperature-hero")).not.toContainText("—");
  const search = page.getByRole("combobox", { name: "Search a city or place" });
  await search.fill("Jammu");
  await page.getByRole("option").filter({ hasText: "Jammu" }).first().click();
  await expect(page.locator(".location-tag")).toContainText("Jammu");
  await page.getByRole("button", { name: "Save place", exact: true }).click();
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  await page.getByLabel("Display name", { exact: true }).fill("E2E Explorer");
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`e2e-${Date.now()}@example.com`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("E2E-only-password-92847!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Save place", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your saved places" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Settings & profile" }).click();
  await expect(page.locator(".saved-place-name")).toContainText("Jammu");
  await page.reload();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue(
    "E2E Explorer",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByText("You’re exploring as a guest.", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile navigation stays inside a 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Weather overview." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Forecast", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your forecast." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("tab", { name: "Hourly details" }).click();
  await expect(
    page.getByRole("columnheader", { name: "Humidity" }),
  ).toBeVisible();
});
