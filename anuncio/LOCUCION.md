# Locución · «La capacidad se demuestra»

Guion de voz del anuncio Brandooers · SkillUp, sacado tal cual del storyboard
(artifact «Brandooers · Storyboard vivo»). **No se cambia el texto.**

- **Voz:** la de Marc más entrenada (clon profesional de ElevenLabs, el del prompter de 19 emociones).
  Para K5 (versión web con lipsync): avatar **Marc Pro** en HeyGen, con el audio de esa misma voz
  subido como archivo, no con el TTS de HeyGen, para que suene igual que el resto del anuncio.
- **Quién habla:** todo es voz en off de Marc en primera persona. Nadie habla a cámara salvo en K5.
- **Formato de entrega:** una toma por plano, archivos `P01.wav` … `P16.wav` y `K5.wav`.

## 1. Generación en ElevenLabs

| Ajuste | Valor | Por qué |
|---|---|---|
| Modelo | Multilingual v2 (o v3 si da mejor la emoción) | v2 es el más estable con clones profesionales en castellano |
| Stability | 0,45–0,55 | por debajo se desmadra; por encima suena leído |
| Similarity | 0,85–0,90 | máxima fidelidad a Marc sin arrastrar ruido del entrenamiento |
| Style | 0,15–0,30 | algo de intención, sin sobreactuar |
| Speaker boost | Activado | |
| Velocidad | 0,95–1,0 | cada frase tiene que entrar en su plano (ver tiempos) |
| Salida | **WAV 48 kHz / 24 bit** (PCM) | nunca MP3 para el máster; 48 kHz es el estándar de vídeo |

Genera 3–4 tomas por frase y elige la mejor. Mejor frase a frase que el bloque entero:
así cada línea tiene su intención y se coloca a medida en el montaje.

## 2. Guion por plano

Tiempo = hueco del plano en el montaje. La voz debe durar como mucho ~85 % del hueco para que respire.

| Plano | Tiempo | Frase | Intención (del prompter de Marc) |
|---|---|---|---|
| P01 | 00:00–00:05 (5 s) | En cada empresa hay capacidad que aún no está dentro. | Reflexión: lento, grave, cálido |
| P02 | 00:05–00:10 (5 s) | Yo también empecé así: un holograma. Sabía de oídas, no de hacer. | Confidencia: más bajo, cerca del micro |
| P03 | 00:10–00:14 (4 s) | Con SkillUp aprendí con casos de mi propio trabajo. | Cercano y natural |
| P04 | 00:14–00:18 (4 s) | Y no es un caso genérico. Es lo mío. | Cercano; pequeña sonrisa en «lo mío» |
| P05 | 00:18–00:23 (5 s) | Practiqué lo difícil antes de hacerlo de verdad. | Autoridad tranquila |
| P06 | 00:23–00:27 (4 s) | Y lo demostré delante de alguien. | Autoridad; cierra hacia abajo |
| P07 | 00:27–00:33 (6 s) | El día que lo demuestras de verdad… dejas de ser un holograma. | Historia con emoción; pausa real en «…» (entra con la fusión) |
| P08 | 00:33–00:37 (4 s) | Y lo que aprendes, lo enseñas. | Cálido, ya persona |
| P09 | 00:37–00:41 (4 s) | Ellos dudaban, como yo dudé. Primero practican con los agentes. | Empatía y calma |
| P10 | 00:41–00:45 (4 s) | Y después, conmigo. | Cercano, con orgullo discreto |
| P11 | 00:45–00:49 (4 s) | Hasta que llevan al cliente sin que yo intervenga. | Autoridad; es la prueba que busca el CEO |
| P12 | 00:49–00:53 (4 s) | Aprendiz. Practicante. Referente. | Alegría contenida; una palabra por golpe de ranking |
| P13 | 00:53–00:58 (5 s) | El conocimiento se queda. Y se multiplica. | Reflexión inspiradora |
| P14 | 00:58–01:02 (4 s) | Ya no dependes de una sola persona. | Seriedad serena |
| P15 | 01:02–01:07 (5 s) | Y tú ves quién lo aplica… y de quién dependes. | Conversación; pausa en «…» |
| P16 | 01:07–01:20 (13 s) | Deja de medir asistencia. Mide capacidad. Brandooers. Si tu equipo no lo adopta, no pagas. Pide un piloto. ¿Eres coach o formador de empresas? Tú pones el método; nosotros, la tecnología. Hablemos. | Urgencia y persuasión → cierre cálido. Se puede generar en 3 trozos (claim · garantía+CTA · coaches) |
| K5 (web) | final versión web | La capacidad se demuestra. Empieza con tu piloto. | Mirando a cámara, microsonrisa. **Lipsync en HeyGen con Marc Pro** |

Pronunciación a vigilar: **Brandooers** («bran-DÚ-ers»), **SkillUp** («skil-ap»).
Si el clon falla, usar el diccionario de pronunciación de ElevenLabs o escribirlo fonético solo en la generación.

## 3. Cadena de sonido «de cine» (voz)

Orden de la cadena, en el DAW o en DaVinci Resolve Fairlight:

1. **Limpieza:** quitar respiraciones feas y clics; *noise reduction* solo si hace falta (el TTS suele venir limpio).
2. **EQ sustractiva**
   - Paso alto 80 Hz, 18 dB/oct (fuera retumbe).
   - −2 a −3 dB en 200–300 Hz, Q ≈ 1,2 (fuera «caja» / barro).
   - Si suena nasal: −1,5 dB en ~1 kHz, Q estrecha.
3. **Compresión:** ratio 3:1, ataque 10–15 ms, release 80–120 ms, 3–5 dB de reducción. Voz estable, sin bombeo.
4. **EQ aditiva (el «color cine»)**
   - +1 dB estantería baja en 120 Hz (cuerpo, cercanía de tráiler).
   - +2 dB en 3–4 kHz, campana ancha (presencia e inteligibilidad).
   - +1,5 a +2 dB estantería alta desde 10–12 kHz (aire).
5. **De-esser:** 5–8 kHz, −3 a −5 dB solo en las eses.
6. **Saturación suave** (cinta/válvula), apenas perceptible: da densidad sin que se note.
7. **Espacio:** reverb corta de sala/placa que case con el atrio, 5–8 % húmedo, pre-delay 20 ms,
   paso alto en la reverb a 300 Hz. La voz en off es íntima: casi seca.
8. **Limitador final** de la pista de voz: techo −1 dBTP.

**Voz en mono y centrada.**

### Mezcla con la música
- Ducking con sidechain: la música baja 6–8 dB cuando habla Marc (o solo la banda de 1–4 kHz con EQ dinámica,
  para que la música no pierda cuerpo).
- Efectos (parpadeo, «tono armónico» de las fusiones P07/P11) por debajo de la voz; en la fusión de P07,
  el tono entra en la pausa «…», no encima de la palabra.

### Loudness del máster (una versión por destino)
| Destino | Integrado | Pico real |
|---|---|---|
| Web / redes (YouTube, Meta, LinkedIn) | −14 LUFS | −1 dBTP |
| TV (EBU R128) | −23 LUFS | −1 dBTP |

Exportar el máster en **WAV 48 kHz / 24 bit** y además los stems por separado (voz · música · efectos) para los cortes de 60, 30 y 15 s.

## 4. K5 en HeyGen (versión web)
1. Generar `K5.wav` con la voz entrenada (tabla de arriba).
2. En HeyGen, con el avatar **Marc Pro**, usar ese audio como fuente (subir archivo), no el TTS.
3. Encuadre: de cuerpo entero sobre blanco puro (#FFFFFF), como el fotograma K5 del storyboard,
   para que empalme con el clip K3→K5 y funcione el `mix-blend-mode: multiply` de la web.
4. Exportar a 1080p o más, con el mismo fondo blanco.

## Pendiente (según la auditoría del storyboard)
- Música con licencia comercial clara (brief de tres tramos).
- Elegir versiones: P09 (v1/v2/v3), P11 (v1/v2), K3→K5 (v1/v2).
