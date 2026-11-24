import { test, expect } from "@playwright/test";

/**
 * Landing page (publique, sans authentification).
 *
 * Vérifie que le site se charge et affiche son titre principal.
 */
test("la page d'accueil se charge et affiche le titre", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(page.locator("h1")).toContainText("Tes erreurs deviennent ton plan de progression.");
  await expect(page.getByRole("link", { name: /Analyser mes parties/ }).first()).toBeVisible();
});
