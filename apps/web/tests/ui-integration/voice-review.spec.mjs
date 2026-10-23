import { test, expect } from '@playwright/test';
import { needsInputTurn } from '../ui-a/fixtures.mjs';
import { mkdir } from 'node:fs/promises';

async function openVoice(page) {
  const calls = { turn: 0, audio: 0 };
  await page.route('**/api/assistant/status', route => route.fulfill({ json: { ready: true, reason: 'ready', remaining_calls: 25 } }));
  await page.route('**/api/assistant/turn', route => {
    calls.turn++;
    return route.fulfill({ json: { ...needsInputTurn(), request_id: route.request().postDataJSON().request_id } });
  });
  await page.route('**/api/voice/**', route => { calls.audio++; return route.fulfill({ json: { text: 'گوشی برای عکاسی' } }); });
  await page.goto('/');
  await page.getByRole('button', { name: 'کمک برای انتخاب', exact: true }).click();
  await page.getByRole('button', { name: 'گفت‌وگوی صوتی با دستیار هوشمند', exact: true }).click();
  return calls;
}

for (const width of [320, 1440]) {
  test(`voice reviews text before a single shared turn and never speaks automatically at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const calls = await openVoice(page);
    const dialog = page.getByRole('dialog', { name: 'گفت‌وگوی صوتی', exact: true });
    await expect(dialog).toBeVisible();
    await mkdir('../../.local/qa/owner-voice', { recursive: true });
    await page.screenshot({ path: `../../.local/qa/owner-voice/dialog-light-${width}.png` });
    expect(calls).toEqual({ turn: 0, audio: 0 });
    await dialog.getByLabel('متن نیاز برای بررسی').fill('گوشی برای عکاسی');
    expect(calls.turn).toBe(0);
    await dialog.getByRole('button', { name: 'بررسی این نیاز', exact: true }).click();
    await expect(dialog.getByText('سقف بودجه‌تان چقدر است؟', { exact: true })).toBeVisible();
    expect(calls).toEqual({ turn: 1, audio: 0 });
    await expect(dialog.getByLabel('متن نیاز برای بررسی')).toHaveValue('');
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'گفت‌وگوی صوتی با دستیار هوشمند', exact: true })).toBeFocused();
    await expect(page.locator('.ua-outcome')).toContainText('سقف بودجه‌تان چقدر است؟');
    await page.getByRole('combobox', { name: 'تم نمایش' }).selectOption('dark');
    await page.getByRole('button', { name: 'گفت‌وگوی صوتی با دستیار هوشمند', exact: true }).click();
    await page.screenshot({ path: `../../.local/qa/owner-voice/dialog-dark-${width}.png` });
  });
}

test('permission denial is recoverable without sending a model or audio request', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { value: {
      getUserMedia: async () => { throw new DOMException('Denied', 'NotAllowedError'); },
    } });
  });
  const calls = await openVoice(page);
  const dialog = page.getByRole('dialog', { name: 'گفت‌وگوی صوتی', exact: true });
  await dialog.getByRole('button', { name: 'شروع ضبط صدا', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('دسترسی به میکروفون داده نشد');
  await expect(dialog.getByRole('button', { name: 'شروع ضبط صدا', exact: true })).toBeEnabled();
  expect(calls).toEqual({ turn: 0, audio: 0 });
});

test('closing before microphone permission resolves releases the late stream without transcribing', async ({ page }) => {
  await page.addInitScript(() => {
    window.__voiceStopped = 0;
    Object.defineProperty(navigator, 'mediaDevices', { value: {
      getUserMedia: () => new Promise(resolve => { window.__allowVoice = () => resolve({ getTracks: () => [{ stop: () => window.__voiceStopped++ }] }); }),
    } });
  });
  const calls = await openVoice(page);
  const dialog = page.getByRole('dialog', { name: 'گفت‌وگوی صوتی', exact: true });
  await dialog.getByRole('button', { name: 'شروع ضبط صدا', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('منتظر اجازه');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__allowVoice());
  await expect.poll(() => page.evaluate(() => window.__voiceStopped)).toBe(1);
  expect(calls).toEqual({ turn: 0, audio: 0 });
});

test('closing during transcription cancels its result and stops microphone tracks', async ({ page }) => {
  await page.addInitScript(() => {
    window.__voiceStopped = 0;
    window.AudioContext = undefined;
    Object.defineProperty(navigator, 'mediaDevices', { value: {
      getUserMedia: async () => ({ getTracks: () => [{ stop: () => window.__voiceStopped++ }] }),
    } });
    window.MediaRecorder = class {
      static isTypeSupported() { return true; }
      state = 'inactive';
      mimeType = 'audio/webm';
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({ data: new Blob(['x'.repeat(120)], { type: this.mimeType }) });
        queueMicrotask(() => this.onstop?.());
      }
    };
  });
  const calls = await openVoice(page);
  let transcriptions = 0;
  await page.route('**/api/voice/transcribe', async route => {
    transcriptions++;
    await new Promise(resolve => setTimeout(resolve, 300));
    try { await route.fulfill({ json: { text: 'پاسخ دیررس' } }); } catch { /* request canceled by closing */ }
  });
  const dialog = page.getByRole('dialog', { name: 'گفت‌وگوی صوتی', exact: true });
  await dialog.getByRole('button', { name: 'شروع ضبط صدا', exact: true }).click();
  await dialog.getByRole('button', { name: 'پایان ضبط و تبدیل به متن', exact: true }).click();
  await expect.poll(() => transcriptions).toBe(1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  await expect.poll(() => page.evaluate(() => window.__voiceStopped)).toBe(1);
  await page.getByRole('button', { name: 'گفت‌وگوی صوتی با دستیار هوشمند', exact: true }).click();
  await expect(dialog.getByLabel('متن نیاز برای بررسی')).toHaveValue('');
  expect(calls).toEqual({ turn: 0, audio: 0 });
});
