export type Ttl = '5m' | '1h'
export type TtlMode = 'auto' | Ttl

/** Why the cache is known cold before its time ran out. */
export type ColdReason = 'compact' | 'clear' | 'model'

export type CacheInfo = {
  /** When the last main-thread request was sent (ms since epoch); null = no cache yet. */
  lastAt: number | null
  /** Prompt tokens that request carried: what a cold start would write again. */
  tokens: number
  /** Last request's split. */
  read: number
  write: number
  /** Set when an event threw the cache away early. */
  cold: ColdReason | null
  /** Requests this session that found the cache cold and rewrote it. */
  misses: number
  /** Tokens served from cache this session. */
  savedTokens: number
}

export type View = {
  isHidden: boolean
  isExpanded: boolean
  isRefreshing: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'onbellek-sayaci': {
      cache: CacheInfo
      ttlMode: TtlMode
      ttl: Ttl
      now: number
      view: View
    }
  }
}
