# Cache Timer (onbellek-sayaci)

**English** · [Türkçe](README.tr.md)

A Claude Code mod that shows, in a single-line band above the prompt box, how
long until the prompt cache goes cold. Once the cache expires, your next
message pays to write the whole context again, as if it were the first
message. This band lets you see that coming.

- 🔥 Warm: countdown bar, time left, how many tokens are cached
- ⏳ About to go cold: the band turns amber and a toast appears (last 5 min for a 1 h cache, last 1 min for a 5 min cache)
- ❄️ Cold: how many tokens the next message will rewrite and the rough cost multiple
- Shows early expiry with its cause (model switch, `/compact`); resets after `/clear`
- Learns the cache lifetime (5 min / 1 h) by itself
- **♻ Keep warm** button: refreshes the cache for about 0.1× the input price (only when you press it)

The band only displays; showing or hiding it does not touch the cache.

> The interface text of the mod is in Turkish.

## Commands

```
/onbellek              status summary
/onbellek 5m|1h|auto   cache lifetime
/onbellek gizle|goster hide / show the band
/onbellek sicak        refresh the cache now
```

## Install

At the prompt of a terminal session:

```
/plugin install onbellek-sayaci --marketplace stalogical/claude-cache-timer
```

From a shell:

```bash
claude plugin install onbellek-sayaci --marketplace stalogical/claude-cache-timer
```

In the desktop app: click + next to the prompt box → Plugins → Add marketplace
(`stalogical/claude-cache-timer`) → Add plugin.

## License

MIT
