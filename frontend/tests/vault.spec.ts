import { test, expect } from "@playwright/test";

test("Home has local artwork, an intact responsive frame, and no runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator(".featured-art")).toHaveCSS("opacity", "1");
  await expect(page.locator(".library-section")).toHaveCSS("opacity", "1");
  await expect(
    page.getByRole("heading", { name: "Back in rotation" }),
  ).toBeVisible();
  await expect(page.locator(".album-shelf .album-card")).toHaveCount(6);
  await expect(page.locator(".playlist-grid .playlist-card")).toHaveCount(3);
  await page.locator(".library-section").scrollIntoViewIfNeeded();
  await page.waitForFunction(() =>
    Array.from(document.images).every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "output/desktop-home.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("Search filters static music, exposes an empty state, and traps keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog", { name: "Search your music" });
  await expect(search).toBeVisible();
  const input = page.getByRole("textbox", { name: "Search your music" });
  await expect(input).toBeFocused();
  await input.fill("Nora");
  await expect(search.locator(".track-row")).toHaveCount(3);
  await expect(search.locator(".search-result-count")).toHaveText("4 results");
  await input.fill("nothing-in-my-vault");
  await expect(
    search.getByRole("heading", {
      name: "No music found for “nothing-in-my-vault”",
    }),
  ).toBeVisible();
  await input.press("Shift+Tab");
  await expect(
    search.getByRole("button", { name: "Close search" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Favorites, library categories, artists, playlists, and view history work", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", {
    name: "Main navigation",
    exact: true,
  });
  await nav.getByRole("button", { name: "Favorites" }).click();
  await expect(
    page.getByRole("heading", { name: "A little closer to heart." }),
  ).toBeVisible();
  await expect(page.locator(".track-row")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Remove Weightless from favorites" })
    .click();
  await expect(page.locator(".track-row")).toHaveCount(5);
  await nav.getByRole("button", { name: "Your library" }).click();
  await page.getByRole("tab", { name: "Albums" }).click();
  await expect(page.locator(".album-grid .album-card")).toHaveCount(6);
  await page.getByRole("tab", { name: "Artists" }).click();
  await page.getByRole("button", { name: "Eden Indie electronic" }).click();
  await expect(page.getByRole("dialog", { name: "Eden" })).toBeVisible();
  await expect(page.locator(".detail-panel .track-row")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await nav.getByRole("button", { name: "Playlists", exact: true }).click();
  await expect(page.locator(".playlist-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Go back" }).click();
  await expect(
    page.getByRole("heading", { name: "Your library." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Go forward" }).click();
  await expect(
    page.getByRole("heading", { name: "Your moments, on repeat." }),
  ).toBeVisible();
});
