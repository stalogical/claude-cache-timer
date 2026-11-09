# Önbellek Sayacı (onbellek-sayaci)

Claude Code için bir mod. İstem önbelleğinin (prompt cache) soğumasına kalan
süreyi mesaj kutusunun üstünde, tek satırlık bir bantta gösterir.

- 🔥 Sıcak: geri sayım çubuğu, kalan süre, önbellekteki token miktarı
- ⏳ Soğumak üzere: bant sarıya döner ve bildirim çıkar (1 sa önbellekte son 5 dk, 5 dk önbellekte son 1 dk)
- ❄️ Soğuk: bir sonraki mesajın baştan yazacağı token miktarı ve yaklaşık maliyet katı
- Model değişimi ve `/compact` gibi erken soğumaları sebebiyle gösterir; `/clear` sonrası sıfırlanır
- Önbellek süresini (5 dk / 1 sa) kendisi öğrenir
- **♻ Sıcak tut** düğmesi: önbelleği yaklaşık 0,1× maliyetle tazeler (yalnızca basınca)

Bant yalnızca gösterir; açıp kapatmak önbelleği etkilemez.

## Komutlar

```
/onbellek              durum özeti
/onbellek 5m|1h|auto   önbellek süresi
/onbellek gizle|goster bandı gizle / göster
/onbellek sicak        önbelleği şimdi tazele
```

## Kurulum

Terminal oturumunda:

```
/plugin install onbellek-sayaci --marketplace stalogical/claude-cache-timer
```

Kabukta:

```bash
claude plugin install onbellek-sayaci --marketplace stalogical/claude-cache-timer
```

Masaüstü uygulamasında: istem kutusunun yanındaki + → Plugins → Add marketplace
(`stalogical/claude-cache-timer`) → Add plugin.

## Lisans

MIT
