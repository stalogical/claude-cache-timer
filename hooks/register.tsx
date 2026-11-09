import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CacheInfo, ColdReason, Ttl, TtlMode, View } from '../types'

// Anthropic price multipliers against base input: a cache read is 0.1x,
// a cache write 1.25x (5 min) or 2x (1 hour).
const WRITE_X: Record<Ttl, number> = { '5m': 1.25, '1h': 2 }
const READ_X = 0.1
const TTL_MS: Record<Ttl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }
// Warn this long before the cache goes cold.
const WARN_MS: Record<Ttl, number> = { '5m': 60_000, '1h': 5 * 60_000 }

const EMPTY: CacheInfo = {
  lastAt: null,
  tokens: 0,
  read: 0,
  write: 0,
  cold: null,
  misses: 0,
  savedTokens: 0,
}

const cache = atom({ plugin: 'onbellek-sayaci', key: 'cache' } as const, EMPTY)
const ttlMode = atom({ plugin: 'onbellek-sayaci', key: 'ttlMode' } as const, 'auto' as TtlMode)
const ttl = atom({ plugin: 'onbellek-sayaci', key: 'ttl' } as const, '1h' as Ttl)
const now = atom({ plugin: 'onbellek-sayaci', key: 'now' } as const, 0)
const view = atom(
  { plugin: 'onbellek-sayaci', key: 'view' } as const,
  { isHidden: false, isExpanded: false, isRefreshing: false } as View,
)

const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const fmtAgo = (ms: number) => {
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'az önce'
  if (m < 60) return `${m} dk önce`
  const h = Math.floor(m / 60)
  return `${h} sa ${m % 60} dk önce`
}

const COLD_TEXT: Record<ColdReason, string> = {
  compact: 'sohbet sıkıştırıldı',
  clear: '/clear yapıldı',
  model: 'model değişti',
}

const TTL_LABEL: Record<Ttl, string> = { '5m': '5 dk', '1h': '1 sa' }

async function markCold($: EngineInterface, why: ColdReason) {
  await update($, cache, c => ({ ...c, cold: why }))
}

async function keepWarm($: EngineInterface): Promise<string> {
  const v = await read($, view)
  if (v.isRefreshing) return 'Zaten yenileniyor.'
  await update($, view, x => ({ ...x, isRefreshing: true }))
  try {
    const sentAt = await $.clock.now()
    const r = await $.model.fork({ prompt: 'Önbellek yenileme. Yalnızca "ok" yaz.' })
    if (!r.isAnswered) return `Yenilenemedi (${r.reason}).`
    const u = r.usage
    const isHit = u.cache_read_input_tokens > u.cache_creation_input_tokens
    await update($, cache, c => ({
      ...c,
      lastAt: sentAt,
      cold: null,
      read: u.cache_read_input_tokens,
      write: u.cache_creation_input_tokens,
      savedTokens: c.savedTokens + u.cache_read_input_tokens,
    }))
    return isHit
      ? `♻️ Önbellek tazelendi (${fmtTokens(u.cache_read_input_tokens)} token okundu, ~0.1× maliyet).`
      : `Önbellek zaten soğumuştu; yeniden yazıldı (${fmtTokens(u.cache_creation_input_tokens)} token).`
  } finally {
    await update($, view, x => ({ ...x, isRefreshing: false }))
  }
}

export const register: Register = on => {
  // Toasts fire once per cache write; reset whenever a new request lands.
  let warnedFor: number | null = null
  let coldToastFor: number | null = null

  on('session.start', async ($, e, next) => {
    const stored = await $.store.get('ttlMode')
    if (stored === '5m' || stored === '1h' || stored === 'auto') {
      await update($, ttlMode, () => stored)
    }
    const learned = await $.store.get('learnedTtl')
    const mode = await read($, ttlMode)
    if (mode !== 'auto') await update($, ttl, () => mode)
    else if (learned === '5m' || learned === '1h') await update($, ttl, () => learned)

    await $.command.register({
      name: 'onbellek',
      description: 'Önbellek sayacı: 5m | 1h | auto (TTL), gizle | goster, sicak (sıcak tut)',
      argumentHint: '[5m|1h|auto|gizle|goster|sicak]',
    })

    await update($, now, () => 0)
    const tick = async () => {
      const t = await $.clock.now()
      await update($, now, () => t)

      const c = await read($, cache)
      if (c.lastAt === null || c.cold) return
      const life = TTL_MS[await read($, ttl)]
      const left = c.lastAt + life - t
      const warnAt = WARN_MS[await read($, ttl)]

      if (left <= 0 && coldToastFor !== c.lastAt) {
        coldToastFor = c.lastAt
        $.ui.toast(`❄️ Önbellek soğudu: sonraki mesaj ~${fmtTokens(c.tokens)} token'ı baştan yazar`)
      } else if (left > 0 && left <= warnAt && warnedFor !== c.lastAt) {
        warnedFor = c.lastAt
        $.ui.toast(`⏳ Önbellek ${fmtTime(left)} içinde soğuyacak. Ya şimdi yaz ya da /onbellek sicak`)
      }
    }
    $.clock.every(1000, () => void tick())

    return next(e)
  })

  // Every main-thread model request writes or refreshes the cache.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)

    const sentAt = await $.clock.now()
    const before = await read($, cache)
    const result = yield* next(e)
    const u = result.usage
    if (!u) return result

    const read_ = u.cache_read_input_tokens
    const write = u.cache_creation_input_tokens
    const tokens = read_ + write + u.input_tokens
    const isMiss = before.lastAt !== null && tokens > 2048 && write > read_

    // Learn the TTL from a gap between 5 and 60 minutes.
    if ((await read($, ttlMode)) === 'auto' && before.lastAt !== null && !before.cold) {
      const gap = sentAt - before.lastAt
      if (gap > 5.5 * 60_000 && gap < 59 * 60_000 && tokens > 2048) {
        const learned: Ttl = read_ > write ? '1h' : '5m'
        await update($, ttl, () => learned)
        await $.store.set('learnedTtl', learned)
      }
    }

    await update($, cache, c => ({
      lastAt: sentAt,
      tokens,
      read: read_,
      write,
      cold: null,
      misses: c.misses + (isMiss ? 1 : 0),
      savedTokens: c.savedTokens + read_,
    }))
    return result
  })

  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    await markCold($, 'compact')
    return r
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, cache, () => ({ ...EMPTY }))
    return next(e)
  })

  on('classic.PostModelSwitch', async ($, e, next) => {
    if ((await read($, ttlMode)) === 'auto') await update($, ttl, () => e.cache_ttl)
    await markCold($, 'model')
    return next(e)
  })

  on('command.run', { command: 'onbellek' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === '5m' || arg === '1h' || arg === 'auto') {
      await update($, ttlMode, () => arg)
      await $.store.set('ttlMode', arg)
      if (arg !== 'auto') await update($, ttl, () => arg)
      return { text: `Önbellek süresi: ${arg === 'auto' ? 'otomatik' : TTL_LABEL[arg]}.` }
    }
    if (arg === 'gizle' || arg === 'goster' || arg === 'göster') {
      const isHidden = arg === 'gizle'
      await update($, view, v => ({ ...v, isHidden }))
      return { text: isHidden ? 'Önbellek bandı gizlendi.' : 'Önbellek bandı gösteriliyor.' }
    }
    if (arg === 'sicak' || arg === 'sıcak') {
      const c = await read($, cache)
      if (c.lastAt === null) return { text: 'Henüz önbellek yok.' }
      return { text: await keepWarm($) }
    }
    const c = await read($, cache)
    const t = await $.clock.now()
    const life = await read($, ttl)
    const left = c.lastAt === null ? 0 : c.lastAt + TTL_MS[life] - t
    return {
      text: [
        c.lastAt === null
          ? 'Henüz önbellek yok.'
          : c.cold
            ? `Önbellek soğuk (${COLD_TEXT[c.cold]}).`
            : left > 0
              ? `Önbellek sıcak, ${fmtTime(left)} kaldı.`
              : `Önbellek soğudu (${fmtAgo(-left)}).`,
        `TTL: ${TTL_LABEL[life]} (${(await read($, ttlMode)) === 'auto' ? 'otomatik' : 'elle'}).`,
        `Bu oturumda önbellekten okunan: ${fmtTokens(c.savedTokens)} token, soğuk başlangıç: ${c.misses}.`,
        'Kullanım: /onbellek 5m | 1h | auto | gizle | goster | sicak',
      ].join('\n'),
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, view)
    if (e.props.hasSurvey || v.isHidden) return next(e)

    const c = await read($, cache)
    const t = (await read($, now)) || (await $.clock.now())
    const life = await read($, ttl)
    const mode = await read($, ttlMode)
    const { Box, Text, Button } = $.ui.resolve(e)

    const ttlTag = (
      <Text dimColor>
        {' '}
        · {TTL_LABEL[life]}
        {mode === 'auto' ? '' : ' (elle)'}
      </Text>
    )
    const controls = [
      <Button
        key="more"
        plain
        label={v.isExpanded ? '▴' : '▾'}
        onPress={() => update($, view, x => ({ ...x, isExpanded: !x.isExpanded }))}
      />,
      <Button key="hide" plain label="✕" onPress={() => update($, view, x => ({ ...x, isHidden: true }))} />,
    ]

    if (c.lastAt === null) {
      return (
        <Box>
          <Text dimColor>💤 Önbellek henüz yok: ilk mesaj tam fiyat yazılır </Text>
          {controls}
        </Box>
      )
    }

    const total = TTL_MS[life]
    const left = c.lastAt + total - t
    const isCold = c.cold !== null || left <= 0
    const isWarn = !isCold && left <= WARN_MS[life]
    const ratio = Math.round(WRITE_X[life] / READ_X)

    let line
    if (e.props.isWorking || v.isRefreshing) {
      line = (
        <Text color="success">♨️ Önbellek tazeleniyor… </Text>
      )
    } else if (isCold) {
      const why = c.cold ? COLD_TEXT[c.cold] : `${fmtAgo(-left)} soğudu`
      line = (
        <Text>
          <Text color="subtle">❄️ Önbellek soğuk</Text>
          <Text dimColor> ({why}) · sonraki mesaj ~{fmtTokens(c.tokens)} token baştan, ~{ratio}× pahalı </Text>
        </Text>
      )
    } else {
      const cells = 12
      const filled = Math.max(1, Math.round((left / total) * cells))
      const color = isWarn ? 'warning' : 'success'
      line = (
        <Text>
          <Text color={color}>{isWarn ? '⏳' : '🔥'} </Text>
          <Text color={color}>{'▰'.repeat(filled)}</Text>
          <Text dimColor>{'▱'.repeat(cells - filled)}</Text>
          <Text color={color} bold tabular>
            {' '}
            {fmtTime(left)}
          </Text>
          {ttlTag}
          <Text dimColor> · {fmtTokens(c.tokens)} token sıcak </Text>
        </Text>
      )
    }

    const warmButton =
      !e.props.isWorking && !v.isRefreshing && !c.cold && (isWarn || v.isExpanded) && !isCold ? (
        <Button key="warm" label="♻ Sıcak tut" onPress={() => void keepWarm($)} />
      ) : null

    return (
      <Box flexDirection="column">
        <Box>
          {line}
          {warmButton}
          {controls}
        </Box>
        {v.isExpanded && (
          <Text dimColor>
            Son istek: {fmtTokens(c.read)} okundu, {fmtTokens(c.write)} yazıldı · oturumda önbellekten{' '}
            {fmtTokens(c.savedTokens)} · soğuk başlangıç {c.misses} · /onbellek 5m|1h|auto
          </Text>
        )}
      </Box>
    )
  })
}
