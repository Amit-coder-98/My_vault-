import { test, expect, type Page, type Locator } from "@playwright/test";

const frame = (page: Page) => page.locator(".player-frame");
const position = (page: Page) =>
  frame(page).getByRole("slider", { name: "Playback position", exact: true });
const audioTime = (page: Page) =>
  page
    .locator("audio[data-vault-audio]")
    .evaluate((el: HTMLAudioElement) => el.currentTime);
async function select(page: Page, title = "Golden Hour") {
  await page
    .getByRole("button", { name: "Play " + title, exact: true })
    .click();
  await expect(frame(page)).toHaveAttribute("data-status", "PLAYING");
}
async function expand(page: Page, full = true) {
  await page
    .getByRole("button", { name: "Expand music player", exact: true })
    .click();
  await expect(frame(page)).toHaveAttribute("data-mode", "expanded");
  if (full) {
    await frame(page)
      .getByRole("button", { name: "Open immersive player", exact: true })
      .click();
    await expect(frame(page)).toHaveAttribute("data-mode", "fullscreen");
  }
}
async function seek(slider: Locator, seconds: number) {
  await slider.evaluate((el: HTMLInputElement, value) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(el, String(value));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, seconds);
}
async function unfocus(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
}

test("Idle has an honest empty state, disabled playback, and no audio downloads", async ({
  page,
}) => {
  const downloads: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/audio/")) downloads.push(r.url());
  });
  await page.goto("/");
  await expect(frame(page)).toHaveAttribute("data-status", "IDLE");
  await expect(
    frame(page).getByText("No song playing", { exact: true }),
  ).toBeVisible();
  await expect(
    frame(page).getByText("Select a song to begin listening."),
  ).toBeVisible();
  await expect(
    frame(page).getByRole("button", { name: "Play music", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Open play queue" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Your listening queue" })
      .getByText("A little room for music."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(downloads).toEqual([]);
  await expect(page.locator("audio")).toHaveCount(1);
});

test("Actual audio, exact seek position, queue and page scroll survive all three modes", async ({
  page,
}) => {
  const messages: string[] = [];
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) messages.push(m.text());
  });
  await page.goto("/");
  await select(page);
  await frame(page)
    .getByRole("button", { name: "Pause playback", exact: true })
    .click();
  await seek(position(page), 8.4);
  const before = await audioTime(page);
  const scroll = await page.evaluate(() => scrollY);
  await expand(page, false);
  await expect(position(page)).toHaveValue("8.4");
  const box = await frame(page).boundingBox();
  expect(box!.width).toBeLessThan(1440);
  await frame(page)
    .getByRole("button", { name: "Open immersive player", exact: true })
    .click();
  await expect(frame(page)).toHaveAttribute("data-mode", "fullscreen");
  await expect(position(page)).toHaveValue("8.4");
  await expect(
    frame(page).getByRole("heading", { name: "Golden Hour", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".waveform-renderer canvas")).toHaveCount(2);
  await frame(page)
    .getByRole("button", { name: /Up next/ })
    .click();
  await expect(page.locator(".queue-item")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(frame(page)).toHaveAttribute("data-mode", "fullscreen");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  await page.keyboard.press("Escape");
  await expect(frame(page)).toHaveAttribute("data-mode", "mini");
  await expect(
    page.getByRole("button", { name: "Expand music player", exact: true }),
  ).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  expect(await audioTime(page)).toBeCloseTo(before, 1);
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name: "Your library" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your library.", exact: true }),
  ).toBeVisible();
  expect(await audioTime(page)).toBeCloseTo(before, 1);
  await expect(page.locator("audio")).toHaveCount(1);
  expect(messages).toEqual([]);
});

test("Waveform click/drag and the timeline seek real media; previous restarts after three seconds", async ({
  page,
}) => {
  await page.goto("/");
  await select(page);
  await expand(page);
  await frame(page)
    .getByRole("button", { name: "Pause playback", exact: true })
    .click();
  const wave = frame(page).getByRole("slider", { name: "Waveform position" });
  const box = (await wave.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.65, box.y + box.height / 2);
  expect(await audioTime(page)).toBeGreaterThan(15);
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  expect(await audioTime(page)).toBeLessThan(9);
  await frame(page)
    .getByRole("button", { name: "Previous track", exact: true })
    .click();
  await expect(position(page)).toHaveValue("0");
  await expect(
    frame(page).getByRole("heading", { name: "Golden Hour", exact: true }),
  ).toBeVisible();
  await position(page).press("ArrowRight");
  await expect(position(page)).toHaveAttribute(
    "aria-valuetext",
    "0:00 of 0:26",
  );
  await frame(page)
    .getByRole("button", { name: "Next track", exact: true })
    .click();
  await expect(
    frame(page).getByRole("heading", { name: "Sunroom", exact: true }),
  ).toBeVisible();
  await expect(frame(page)).toHaveAttribute("data-status", "PAUSED");
  await frame(page)
    .getByRole("button", { name: "Previous track", exact: true })
    .click();
  await expect(
    frame(page).getByRole("heading", { name: "Golden Hour", exact: true }),
  ).toBeVisible();
});

test("Queue editing preserves the player, marks only the active row, and supports clearing to idle", async ({
  page,
}) => {
  await page.goto("/");
  await select(page);
  await expand(page);
  await frame(page)
    .getByRole("button", { name: /Up next/ })
    .click();
  const queue = page.getByRole("dialog", { name: "Your listening queue" });
  await expect(queue.locator(".queue-item")).toHaveCount(3);
  await expect(queue.locator(".queue-item-active .tiny-equalizer")).toHaveCount(
    1,
  );
  await expect(
    queue
      .locator(".queue-select")
      .filter({ hasText: "Sunroom" })
      .getByText("Up next"),
  ).toBeVisible();
  await queue
    .getByRole("button", { name: "Remove Sunroom from queue" })
    .click();
  await expect(queue.locator(".queue-item")).toHaveCount(2);
  await queue
    .getByRole("button", { name: "Play Homebound from queue" })
    .click();
  await expect(queue.locator(".queue-current strong")).toContainText(
    "Homebound",
  );
  await queue.getByRole("button", { name: "Clear up next" }).click();
  await expect(queue.locator(".queue-item")).toHaveCount(1);
  await expect(frame(page)).toHaveAttribute("data-mode", "fullscreen");
  await queue
    .getByRole("button", { name: "Remove Homebound from queue" })
    .click();
  await expect(frame(page)).toHaveAttribute("data-status", "IDLE");
  await expect(queue.getByText("A little room for music.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    frame(page).getByText("No song playing", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  expect(
    await page.locator("audio").evaluate((el: HTMLAudioElement) => el.paused),
  ).toBe(true);
});

test("Repeat one/all/off and shuffle history honor a real three-song queue", async ({
  page,
}) => {
  await page.goto("/");
  await select(page);
  await expand(page);
  await frame(page).getByRole("button", { name: "Repeat: off" }).click();
  await frame(page).getByRole("button", { name: "Repeat: all" }).click();
  await seek(position(page), 25.85);
  await expect.poll(() => audioTime(page)).toBeLessThan(3);
  await expect(
    frame(page).getByRole("heading", { name: "Golden Hour", exact: true }),
  ).toBeVisible();
  await frame(page).getByRole("button", { name: "Repeat: one" }).click();
  await frame(page)
    .getByRole("button", { name: "Next track", exact: true })
    .click();
  await frame(page)
    .getByRole("button", { name: "Next track", exact: true })
    .click();
  await expect(
    frame(page).getByRole("heading", { name: "Homebound", exact: true }),
  ).toBeVisible();
  await seek(position(page), 25.85);
  await expect(frame(page)).toHaveAttribute("data-status", "PAUSED");
  await expect(
    frame(page).getByRole("heading", { name: "Homebound", exact: true }),
  ).toBeVisible();
  await frame(page).getByRole("button", { name: "Repeat: off" }).click();
  await frame(page)
    .getByRole("button", { name: "Next track", exact: true })
    .click();
  await expect(
    frame(page).getByRole("heading", { name: "Golden Hour", exact: true }),
  ).toBeVisible();
  await frame(page).getByRole("button", { name: "Enable shuffle" }).click();
  const titles = ["Golden Hour"];
  for (let i = 0; i < 2; i++) {
    await frame(page)
      .getByRole("button", { name: "Next track", exact: true })
      .click();
    await expect(frame(page).getByRole("heading")).not.toHaveText(
      titles.at(-1)!,
    );
    titles.push(await frame(page).getByRole("heading").innerText());
  }
  expect(new Set(titles).size).toBe(3);
  await frame(page)
    .getByRole("button", { name: "Previous track", exact: true })
    .click();
  await expect(frame(page).getByRole("heading")).toHaveText(titles[1]);
});

test("Mute, volume, and favorites stay shared when views change", async ({
  page,
}) => {
  await page.goto("/");
  await select(page);
  await expand(page, false);
  await seek(
    frame(page).getByRole("slider", { name: "Volume", exact: true }),
    0.42,
  );
  await frame(page).getByRole("button", { name: "Mute", exact: true }).click();
  await expect(
    frame(page).getByRole("slider", { name: "Volume", exact: true }),
  ).toHaveValue("0");
  expect(
    await page.locator("audio").evaluate((el: HTMLAudioElement) => el.muted),
  ).toBe(true);
  await frame(page)
    .getByRole("button", { name: "Remove current song from favorites" })
    .click();
  await frame(page)
    .getByRole("button", { name: "Open immersive player", exact: true })
    .click();
  await expect(
    frame(page).getByRole("button", { name: "Favorite current song" }),
  ).toHaveAttribute("aria-pressed", "false");
  await frame(page)
    .getByRole("button", { name: "Unmute", exact: true })
    .click();
  await expect(
    frame(page).getByRole("slider", { name: "Volume", exact: true }),
  ).toHaveValue("0.42");
  await page.keyboard.press("Escape");
  const mute = frame(page).getByRole("button", { name: "Mute", exact: true });
  await mute.focus();
  await expect(
    frame(page).getByRole("slider", { name: "Volume", exact: true }),
  ).toBeVisible();
  const miniVolume = frame(page).getByRole("slider", {
    name: "Volume",
    exact: true,
  });
  await miniVolume.press("ArrowRight");
  await expect(miniVolume).toHaveValue("0.43");
  const bar = (await frame(page).boundingBox())!;
  const slider = (await miniVolume.boundingBox())!;
  expect(slider.y).toBeGreaterThanOrEqual(bar.y);
  expect(slider.y + slider.height).toBeLessThanOrEqual(bar.y + bar.height);
});

test("Keyboard controls work without hijacking typing or native sliders", async ({
  page,
}) => {
  await page.goto("/");
  await select(page);
  await unfocus(page);
  await page.keyboard.press("Space");
  await expect(frame(page)).toHaveAttribute("data-status", "PAUSED");
  await page.keyboard.press("ArrowRight");
  expect(await audioTime(page)).toBeCloseTo(5, 0);
  await page.keyboard.press("ArrowLeft");
  expect(await audioTime(page)).toBeCloseTo(0, 0);
  await page.keyboard.press("m");
  expect(
    await page.locator("audio").evaluate((el: HTMLAudioElement) => el.muted),
  ).toBe(true);
  await page.keyboard.press("f");
  await expect(
    frame(page).getByRole("button", { name: "Favorite current song" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("n");
  await expect(frame(page).locator(".player-metadata strong")).toHaveText(
    "Sunroom",
  );
  await page.keyboard.press("p");
  await expect(frame(page).locator(".player-metadata strong")).toHaveText(
    "Golden Hour",
  );
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog", { name: "Search your music" });
  await search.getByRole("textbox").pressSequentially("m n p f ");
  await expect(frame(page).locator(".player-metadata strong")).toHaveText(
    "Golden Hour",
  );
  expect(await audioTime(page)).toBeCloseTo(0, 0);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name: "Your library" })
    .click();
  await page.getByRole("tab", { name: /^songs$/i }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: /^albums$/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await audioTime(page)).toBeCloseTo(0, 0);
});

test("Loading can be cancelled, buffering preserves controls, and neither changes the surface", async ({
  page,
}) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/audio/golden.wav", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Play Golden Hour", exact: true })
    .click();
  await expect(frame(page)).toHaveAttribute("data-status", "LOADING");
  await expect(
    page.getByRole("button", { name: "Pause listening", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Expand music player", exact: true })
    .click();
  await expect(frame(page).getByText("Getting your song ready…")).toBeVisible();
  await frame(page)
    .getByRole("button", { name: "Pause playback", exact: true })
    .click();
  release();
  await expect(frame(page)).toHaveAttribute("data-status", "PAUSED");
  await frame(page)
    .getByRole("button", { name: "Play music", exact: true })
    .click();
  await expect(frame(page)).toHaveAttribute("data-status", "PLAYING");
  const box = await frame(page).boundingBox();
  await page
    .locator("audio")
    .evaluate((el) => el.dispatchEvent(new Event("waiting")));
  await expect(frame(page)).toHaveAttribute("data-status", "BUFFERING");
  await expect(
    frame(page).getByRole("button", { name: "Pause playback", exact: true }),
  ).toBeVisible();
  expect((await frame(page).boundingBox())!.height).toBeCloseTo(box!.height, 0);
  await page
    .locator("audio")
    .evaluate((el) => el.dispatchEvent(new Event("playing")));
  await expect(frame(page)).toHaveAttribute("data-status", "PLAYING");
});

test("Unsupported audio has a clean error with retry and can recover", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/audio/golden.wav", (route) =>
    route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: "invalid-audio",
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Play Golden Hour", exact: true })
    .click();
  await expect(frame(page)).toHaveAttribute("data-status", "ERROR");
  await expand(page);
  await expect(
    frame(page).getByText(/audio format is not supported/),
  ).toBeVisible();
  await expect(
    frame(page).getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await page.unroute("**/audio/golden.wav");
  await frame(page).getByRole("button", { name: "Retry", exact: true }).click();
  await expect(frame(page)).toHaveAttribute("data-status", "PLAYING");
  await frame(page)
    .getByRole("button", { name: "Next track", exact: true })
    .click();
  await expect(
    frame(page).getByRole("heading", { name: "Sunroom", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("Missing artwork and invalid or long durations stay readable and safe", async ({
  page,
}) => {
  await page.route("**/artwork/golden-hour.jpg", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/jpeg",
      body: "broken-image",
    }),
  );
  await page.goto("/");
  await select(page);
  await expand(page);
  await expect(
    frame(page).getByRole("img", { name: "Golden Hour artwork unavailable" }),
  ).toBeVisible();
  await frame(page)
    .getByRole("button", { name: "Pause playback", exact: true })
    .click();
  for (const value of [NaN, Infinity]) {
    await page.locator("audio").evaluate((el, duration) => {
      Object.defineProperty(el, "duration", {
        configurable: true,
        value: duration,
      });
      el.dispatchEvent(new Event("durationchange"));
    }, value);
    await expect(position(page)).toBeDisabled();
    await expect(position(page)).toHaveAttribute(
      "aria-valuetext",
      "Duration unavailable",
    );
    await expect(frame(page).locator(".player-progress")).toContainText(
      "--:--",
    );
  }
  await page.locator("audio").evaluate((el) => {
    Object.defineProperty(el, "duration", { configurable: true, value: 3602 });
    el.dispatchEvent(new Event("durationchange"));
  });
  await expect(frame(page).locator(".player-progress")).toContainText(
    "1:00:02",
  );
  await page.locator("audio").evaluate((el) => {
    Reflect.deleteProperty(el, "duration");
    el.dispatchEvent(new Event("durationchange"));
  });
  await expect(position(page)).toBeEnabled();
});

test("Media Session metadata and browser transport use the shared player", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!("mediaSession" in navigator)) return;
    const handlers: Record<string, MediaSessionActionHandler | null> = {};
    (window as unknown as { mediaHandlers: typeof handlers }).mediaHandlers =
      handlers;
    const original = navigator.mediaSession.setActionHandler.bind(
      navigator.mediaSession,
    );
    navigator.mediaSession.setActionHandler = (action, handler) => {
      handlers[action] = handler;
      original(action, handler);
    };
  });
  await page.goto("/");
  await select(page);
  await expand(page);
  expect(
    await page.evaluate(() => navigator.mediaSession.metadata?.title),
  ).toBe("Golden Hour");
  await page.evaluate(() =>
    (
      window as unknown as {
        mediaHandlers: Record<string, MediaSessionActionHandler>;
      }
    ).mediaHandlers.pause({ action: "pause" }),
  );
  await expect(frame(page)).toHaveAttribute("data-status", "PAUSED");
  await page.evaluate(() =>
    (
      window as unknown as {
        mediaHandlers: Record<string, MediaSessionActionHandler>;
      }
    ).mediaHandlers.seekto({ action: "seekto", seekTime: 11 }),
  );
  expect(await audioTime(page)).toBeCloseTo(11, 1);
  await page.evaluate(() =>
    (
      window as unknown as {
        mediaHandlers: Record<string, MediaSessionActionHandler>;
      }
    ).mediaHandlers.nexttrack({ action: "nexttrack" }),
  );
  await expect(
    frame(page).getByRole("heading", { name: "Sunroom", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => navigator.mediaSession.metadata?.title),
  ).toBe("Sunroom");
});

test("Artwork swipes skip songs and minimize without affecting playback", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await select(page);
  await expand(page);
  await frame(page)
    .getByRole("button", { name: "Pause playback", exact: true })
    .click();
  const art = frame(page).locator(".artwork-gesture");
  let box = (await art.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(
    frame(page).getByRole("heading", { name: "Sunroom", exact: true }),
  ).toBeVisible();
  await expect(art.locator(".album-art")).toHaveCount(1);
  box = (await art.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 115, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(frame(page)).toHaveAttribute("data-mode", "mini");
  await expect(frame(page).locator(".player-metadata strong")).toHaveText(
    "Sunroom",
  );
  await expect(frame(page)).toHaveAttribute("data-status", "PAUSED");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("Rapid song changes, interrupted transitions and resize leave one usable surface", async ({
  page,
}) => {
  const messages: string[] = [];
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) messages.push(m.text());
  });
  await page.goto("/");
  await select(page);
  await expand(page);
  await frame(page).getByRole("button", { name: "Repeat: off" }).click();
  for (let i = 0; i < 7; i++)
    await frame(page)
      .getByRole("button", { name: "Next track", exact: true })
      .evaluate((el) => (el as HTMLButtonElement).click());
  await expect(
    frame(page).getByRole("heading", { name: "Sunroom", exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await frame(page)
      .getByRole("button", { name: "Minimize music player" })
      .evaluate((el) => (el as HTMLButtonElement).click());
    await page
      .getByRole("button", { name: "Expand music player", exact: true })
      .evaluate((el) => (el as HTMLButtonElement).click());
    await frame(page)
      .getByRole("button", { name: "Open immersive player", exact: true })
      .evaluate((el) => (el as HTMLButtonElement).click());
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(frame(page)).toHaveAttribute("data-status", "PLAYING");
  await expect(
    frame(page).getByRole("button", { name: "Pause playback", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".player-frame")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await expect(page.locator("audio")).toHaveCount(1);
  expect(messages).toEqual([]);
});

test("Reduced motion responds live and removes continuous effects without warnings", async ({
  page,
}) => {
  const messages: string[] = [];
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) messages.push(m.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await select(page);
  await expand(page);
  expect(
    await page.evaluate(() =>
      document.documentElement.classList.contains("lenis"),
    ),
  ).toBe(false);
  await expect(frame(page).locator(".ambience-glow")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(page.locator(".ambient-scene")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("lenis")),
    )
    .toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  expect(messages).toEqual([]);
});

test("Optional WebGL ambience falls back gracefully when unavailable", async ({
  page,
}) => {
  const messages: string[] = [];
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) messages.push(m.text());
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, "WebGL2RenderingContext", {
      value: undefined,
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Listening preferences", exact: true })
    .click();
  await page.getByRole("switch", { name: "Ambient particles" }).click();
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await select(page);
  await expand(page);
  await expect(frame(page).locator(".player-ambience")).toBeVisible();
  await expect(page.locator(".ambient-scene")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".ambient-scene")).toHaveCount(0);
  expect(messages).toEqual([]);
});

for (const [width, height] of [
  [375, 812],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1280, 900],
  [1440, 1000],
  [1920, 1080],
]) {
  test(
    "Mini, expanded, fullscreen and queue fit at " + width + "px",
    async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await select(page);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expand(page, false);
      await expect(
        frame(page).getByRole("button", { name: "Next track", exact: true }),
      ).toBeVisible();
      await expect
        .poll(() =>
          frame(page).evaluate((el) => el.scrollWidth - el.clientWidth),
        )
        .toBeLessThanOrEqual(1);
      await expect(frame(page).locator(".player-listening-controls")).toHaveCSS(
        "opacity",
        "1",
      );
      await page.screenshot({ path: "output/expanded-" + width + ".png" });
      await frame(page)
        .getByRole("button", { name: "Open immersive player", exact: true })
        .click();
      await expect(
        frame(page).getByRole("button", {
          name: "Pause playback",
          exact: true,
        }),
      ).toBeVisible();
      await expect
        .poll(() =>
          frame(page).evaluate((el) => el.scrollWidth - el.clientWidth),
        )
        .toBeLessThanOrEqual(1);
      await expect(frame(page).locator(".player-listening-controls")).toHaveCSS(
        "opacity",
        "1",
      );
      await page.screenshot({ path: "output/fullscreen-" + width + ".png" });
      await frame(page)
        .getByRole("button", { name: /Up next/ })
        .click();
      await expect(
        page
          .getByRole("dialog", { name: "Your listening queue" })
          .getByRole("button", { name: "Close queue" }),
      ).toBeVisible();
      await page.screenshot({ path: "output/queue-" + width + ".png" });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect(frame(page)).toHaveAttribute("data-mode", "mini");
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    },
  );
}

test("Optional particles load on capable desktops, stay lazy, and stop on mobile", async ({
  page,
}) => {
  const messages: string[] = [];
  const imports: string[] = [];
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) messages.push(m.text());
  });
  page.on("request", (request) => {
    if (request.url().includes("/AmbientScene.tsx"))
      imports.push(request.url());
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8 });
    Object.defineProperty(navigator, "deviceMemory", { value: 8 });
  });
  await page.goto("/");
  expect(imports).toEqual([]);
  const capable = await page.evaluate(() => {
    const context = document
      .createElement("canvas")
      .getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  });
  await page
    .getByRole("button", { name: "Listening preferences", exact: true })
    .click();
  await page.getByRole("switch", { name: "Ambient particles" }).click();
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await select(page);
  await expand(page);
  if (capable)
    await expect(page.locator(".ambient-scene canvas")).toBeVisible({
      timeout: 15000,
    });
  else await expect(page.locator(".ambient-scene")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".ambient-scene")).toHaveCount(0);
  await expect(frame(page)).toHaveAttribute("data-status", "PLAYING");
  expect(messages).toEqual([]);
});
