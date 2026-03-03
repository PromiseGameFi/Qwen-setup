import { expect, test } from '@playwright/test'

test('create and switch chat thread', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: /^new chat$/i }).click()
  await page.getByPlaceholder('Message Qwen locally...').fill('hello local qwen')
  await page.keyboard.press('Enter')

  await expect(page.getByText('hello local qwen')).toBeVisible()
})

test('settings drawer opens from button and keyboard shortcut', async ({ page }) => {
  const settingsDrawer = page.locator('aside').filter({ hasText: 'Model Provider' })

  await page.goto('/')

  await page.getByRole('button', { name: /^settings$/i }).click()
  await expect(settingsDrawer).toHaveClass(/translate-x-0/)

  await page.keyboard.press('Escape')
  await expect(settingsDrawer).toHaveClass(/translate-x-full/)

  await page.keyboard.press('Control+,')
  await expect(settingsDrawer).toHaveClass(/translate-x-0/)
})

test('mocked chat response streams and persists after reload', async ({ page }) => {
  await page.route('**/chat/completions', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'access-control-allow-origin': '*',
      },
      body: [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        '',
        'data: {"choices":[{"delta":{"content":" from Qwen"}}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
    })
  })

  await page.goto('/')
  await page.getByPlaceholder('Message Qwen locally...').fill('test streaming')
  await page.keyboard.press('Enter')

  await expect(
    page.locator('article').filter({ hasText: 'You' }).filter({ hasText: 'test streaming' }),
  ).toBeVisible()
  await expect(page.getByText('Hello from Qwen')).toBeVisible()

  await page.reload()
  await expect(
    page.locator('article').filter({ hasText: 'You' }).filter({ hasText: 'test streaming' }),
  ).toBeVisible()
  await expect(page.getByText('Hello from Qwen')).toBeVisible()
})
