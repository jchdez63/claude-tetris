---
name: clima
description: Obtiene temperatura y estado del clima actual de la ciudad local del usuario (Nezahualcóyotl, Estado de México) vía wttr.in. Usar cuando pida el clima, la temperatura o "cómo está el tiempo". Acepta otra ciudad como argumento.
---

# Clima local

Ciudad por defecto: `Nezahualcoyotl,Estado+de+Mexico` (Nezahualcóyotl, Estado de México). Si el usuario pasa otra ciudad como argumento, usarla.

## Pasos

1. Ejecutar (sin espacios en la ciudad; usar `+` o `%20`):

```bash
curl -s --max-time 15 "https://wttr.in/Nezahualcoyotl,Estado+de+Mexico?format=%t+%C+%h+%w&lang=es"
```

Formato de salida: temperatura, condición, humedad, viento.

2. Responder en español, extremadamente conciso, en una línea:
   `<Ciudad>: **<temp>**, <condición>, humedad <h>, viento <w>.`

## Notas

- No usar WebSearch: solo devuelve promedios climáticos, no datos en vivo.
- Si `curl` falla o devuelve vacío, decirlo en una línea y sugerir https://smn.conagua.gob.mx.
- Enviar únicamente el nombre de la ciudad al servicio; ningún otro dato del usuario.
