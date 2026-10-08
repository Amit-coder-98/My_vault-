import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

async function login(page: Page, role = "owner") {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(role + "@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("Browser test password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`QA ${role === "owner" ? "Owner" : "Listener"}`),
    }),
  ).toBeVisible();
}
async function manage(page: Page, tab: string) {
  await page.getByRole("button", { name: "Manage vault" }).click();
  await page
    .getByRole("navigation", { name: "Vault management" })
    .getByRole("button", { name: tab, exact: true })
    .click();
}
const frame = (page: Page) => page.locator(".player-frame");

test("Guest routes, invitation-only access, and honest login errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Welcome to your vault." }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Email address").fill("unknown@example.com");
  await page.getByLabel("Password", { exact: true }).fill("Wrong password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Email or password is incorrect",
  );
  await page.goto("/register");
  await expect(
    page.getByText("Ask the owner for an invitation link"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create your account" }),
  ).toHaveCount(0);
  await page.goto("/login");
  await expect(page.locator(".auth-card")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "output/auth-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("Real library, mood collection, waveform, seeking and player continuity", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await expect(page.locator(".feeling-card")).toHaveCount(4);
  await page.getByRole("button", { name: /A MOMENT OF Love/ }).click();
  const collection = page.getByRole("dialog");
  await expect(
    collection.getByRole("heading", { name: "Love", exact: true }),
  ).toBeVisible();
  await collection.getByRole("button", { name: "Play collection" }).click();
  await expect(frame(page)).toHaveAttribute("data-status", "PLAYING");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Expand music player", exact: true })
    .click();
  await expect(page.locator(".waveform-renderer canvas").first()).toBeVisible();
  const slider = frame(page).getByRole("slider", { name: "Waveform position" });
  const box = await slider.boundingBox();
  expect(box).not.toBeNull();
  await slider.click({ position: { x: box!.width * 0.4, y: box!.height / 2 } });
  await expect
    .poll(() =>
      page.locator("audio").evaluate((el: HTMLAudioElement) => el.currentTime),
    )
    .toBeGreaterThan(8);
  await page.keyboard.press("Escape");
  await manage(page, "Overview");
  await expect(
    page.getByRole("heading", { name: "A well kept vault." }),
  ).toBeVisible();
  await expect(frame(page)).toHaveAttribute("data-status", "PLAYING");
  await expect(page.locator("audio")).toHaveCount(1);
  await page.screenshot({ path: "output/admin-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("Custom feelings and styles can be created in the song form and reach listener filters", async ({
  page,
}) => {
  await login(page);
  await manage(page, "Songs");
  await page
    .getByRole("button", { name: "Edit Golden Light", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit song" });
  await dialog.getByRole("button", { name: "New mood", exact: true }).click();
  await dialog.getByLabel("New mood name").fill("Road trip");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Road trip", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "New genre", exact: true }).click();
  await dialog.getByLabel("New genre name").fill("Acoustic");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await dialog
    .getByLabel("Language", { exact: true })
    .selectOption({ label: "English" });
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("button", { name: "Back to music", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /A MOMENT OF Road trip/ }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Your library", exact: true })
    .click();
  await page
    .getByLabel("Filter by feeling")
    .selectOption({ label: "Road trip" });
  await expect(page.locator(".track-row")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Play Golden Light", exact: true }),
  ).toBeVisible();
});

test("Admin invitations create normal user accounts and restrict the management screen", async ({
  page,
  browser,
}) => {
  await login(page);
  await manage(page, "People");
  await page.getByLabel("Friend's email").fill("invited@example.com");
  await page
    .getByRole("button", { name: "Invite friend", exact: true })
    .click();
  await expect(page.getByLabel("Private account link")).toHaveValue(
    /register\?invite=/,
  );
  const link = await page.getByLabel("Private account link").inputValue();
  const context = await browser.newContext();
  const friend = await context.newPage();
  await friend.goto(link);
  await expect(friend.getByLabel("Email address")).toHaveValue(
    "invited@example.com",
  );
  await friend.getByLabel("Your name").fill("My Friend");
  await friend
    .getByLabel("Password", { exact: true })
    .fill("Invited secure password");
  await friend
    .getByLabel("Confirm password", { exact: true })
    .fill("Invited secure password");
  await friend.getByRole("button", { name: "Create your account" }).click();
  await expect(
    friend.getByRole("heading", { name: /My Friend/ }),
  ).toBeVisible();
  await expect(
    friend.getByRole("button", { name: "Manage vault" }),
  ).toHaveCount(0);
  await friend.goto("http://127.0.0.1:5175/admin");
  await expect(
    friend.getByRole("heading", { name: "This space belongs to the owner." }),
  ).toBeVisible();
  await context.close();
});

test("Favorites, smart playlists and session restoration persist per user", async ({
  page,
}) => {
  await login(page, "listener");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Your library", exact: true })
    .click();
  const row = page.locator(".track-row").filter({
    has: page.getByRole("button", { name: "Play Golden Light", exact: true }),
  });
  await row.getByRole("button", { name: /favorite/i }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Playlists", exact: true })
    .click();
  await page.getByRole("button", { name: "Create playlist" }).click();
  const editor = page.getByRole("dialog", { name: "Create a playlist" });
  await editor.getByLabel("Name", { exact: true }).fill("My favorite feelings");
  await editor.getByLabel("Make this a smart playlist").check();
  await editor.getByLabel("Only my favorites").check();
  await editor.getByRole("button", { name: "Save playlist" }).click();
  await expect(editor).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Open My favorite feelings" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /QA Listener/ }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Favorites", exact: true })
    .click();
  await expect(page.locator(".track-row")).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Playlists", exact: true })
    .click();
  await page.getByRole("button", { name: "Open My favorite feelings" }).click();
  await expect(
    page.getByRole("dialog").getByText("1 songs", { exact: true }),
  ).toBeVisible();
});

test("Upload, archive and restore update the real catalog", async ({
  page,
}) => {
  await login(page);
  await manage(page, "Songs");
  await page.getByRole("button", { name: "Add music", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add your music" });
  await dialog
    .getByLabel("Audio files")
    .setInputFiles(path.resolve("public/audio/after.wav"));
  await dialog.getByLabel("Song title", { exact: true }).fill("New night song");
  await dialog.getByLabel("Artist", { exact: true }).fill("Night Sessions");
  await dialog.getByRole("button", { name: "Love", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Upload music", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await page
    .getByRole("button", { name: "Archive New night song", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Restore New night song", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore New night song", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Archive New night song", exact: true }),
  ).toBeVisible();
});

test("An administrator can search a song, add its missing image and change its details", async ({
  page,
}) => {
  await login(page);
  await manage(page, "Songs");
  await page.getByLabel("Search managed songs").fill("Evening Letter");
  await page
    .getByRole("button", { name: "Edit Evening Letter", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit song" });
  await dialog
    .getByLabel("Artist", { exact: true })
    .fill("Night Sessions Updated");
  await dialog.getByLabel("Year", { exact: true }).fill("2026");
  await dialog
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("A song for a quiet evening.");
  await dialog
    .getByLabel("Cover image")
    .setInputFiles(path.resolve("public/artwork/golden-hour.jpg"));
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await page
    .getByRole("navigation", { name: "Vault management" })
    .getByRole("button", { name: "Songs", exact: true })
    .click();
  await page.getByLabel("Search managed songs").fill("Evening Letter");
  await page
    .getByRole("button", { name: "Edit Evening Letter", exact: true })
    .click();
  await expect(dialog.getByLabel("Artist", { exact: true })).toHaveValue(
    "Night Sessions Updated",
  );
  await expect(dialog.getByLabel("Year", { exact: true })).toHaveValue("2026");
  await expect(
    dialog.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("A song for a quiet evening.");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Back to music", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Your library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Play Evening Letter", exact: true })
    .click();
  await expect(frame(page)).toHaveAttribute("data-status", "PLAYING");
  const cover = frame(page).locator('img[src*="/artwork"]');
  await expect(cover).toHaveCount(1);
  await expect
    .poll(() =>
      cover.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
});

test("Artist names can be corrected across songs without interrupting playback", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await manage(page, "Artists & albums");
  await page
    .getByRole("button", { name: "Edit artist Vault Sessions", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit artist" });
  await dialog.getByLabel("Name", { exact: true }).fill("Friends Sessions");
  await dialog.getByRole("button", { name: "Save name" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", {
      name: "Edit artist Friends Sessions",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Manage artists or albums").selectOption("album");
  await page
    .getByRole("button", { name: "Edit album Golden Light", exact: true })
    .click();
  const album = page.getByRole("dialog", { name: "Edit album" });
  await album.getByLabel("Name", { exact: true }).fill("Golden Light EP");
  await album.getByRole("button", { name: "Save name" }).click();
  await expect(album).toBeHidden();
  await expect(
    page.getByRole("button", {
      name: "Edit album Golden Light EP",
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("Archiving the playing song clears it without a stale player crash", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Your library", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Play Golden Light", exact: true })
    .click();
  await expect(frame(page)).toHaveAttribute("data-status", "PLAYING");
  await manage(page, "Songs");
  await page
    .getByRole("button", { name: "Archive Golden Light", exact: true })
    .click();
  await expect(frame(page)).toHaveAttribute("data-status", "IDLE");
  await expect(
    frame(page).getByText("No song playing", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore Golden Light", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Archive Golden Light", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [375, 390, 768, 1440]) {
  test(`Account pages and admin layout fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Welcome to your vault." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `output/auth-${width}.png`, fullPage: true });
    await login(page);
    // Desktop sidebar is intentionally hidden on mobile; admin is also available from Account.
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "A well kept vault." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `output/admin-${width}.png`,
      fullPage: true,
    });
    await page.goto("/account");
    await expect(
      page.getByRole("heading", { name: "Your space." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out of your vault" }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome to your vault." }),
    ).toBeVisible();
    await expect(page.locator("audio")).toHaveCount(0);
  });
}
