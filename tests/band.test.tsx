import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'onbellek-sayaci',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

const T0 = 1_000_000_000_000

const seed = (on: any, values: Record<string, unknown>) =>
  on('state.get', (_: unknown, e: { key: string }) => ({
    value: e.key in values ? { value: values[e.key], version: 1 } : { value: undefined, version: 0 },
  }))

const cache = (lastAt: number | null, cold: string | null = null) => ({
  lastAt,
  tokens: 128_000,
  read: 120_000,
  write: 8_000,
  cold,
  misses: 0,
  savedTokens: 500_000,
})

test('warm cache shows the countdown', async ($, on) => {
  seed(on, { cache: cache(T0), ttl: '1h', ttlMode: 'auto', now: T0 + 18 * 60_000 })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /42:00/ }))?.text).toContain('42:00')
    expect(await ui.find({ type: 'Text', text: /128k token sıcak/ })).toBeTruthy()
    await ui.unmount()
  }
})

test('near the end it warns and offers keep-warm', async ($, on) => {
  seed(on, { cache: cache(T0), ttl: '5m', ttlMode: 'auto', now: T0 + 4.5 * 60_000 })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /00:30/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'warm' })).toBeTruthy()
  await ui.unmount()
})

test('expired cache says cold and the cost', async ($, on) => {
  seed(on, { cache: cache(T0), ttl: '1h', ttlMode: 'auto', now: T0 + 70 * 60_000 })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Önbellek soğuk/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /20× pahalı/ })).toBeTruthy()
  await ui.unmount()
})

test('a model switch marks it cold early', async ($, on) => {
  seed(on, { cache: cache(T0, 'model'), ttl: '1h', ttlMode: 'auto', now: T0 + 60_000 })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /model değişti/ })).toBeTruthy()
  await ui.unmount()
})
