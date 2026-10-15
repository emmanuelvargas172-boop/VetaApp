#!/usr/bin/env python3
"""
Genera la narración del video con MiniMax en vez de la voz del sistema.

Mismo guion y mismo resultado que narracion.py —los wav en public/audio y el
src/narracion.json con las duraciones—, cambiando solo de dónde sale la voz.
El texto se importa de narracion.py a propósito: si el guion viviera en dos
archivos, tarde o temprano uno se queda viejo y el video diría una cosa
distinta según con qué voz se generó.

Solo biblioteca estándar: corre con el python3 que trae macOS, sin instalar
nada.

La clave NO va en el código. Se lee de video/.env, que está en el .gitignore:

    MINIMAX_API_KEY=...

Uso:
    python3 herramientas/narracion_minimax.py voces   # lista las voces en español
    python3 herramientas/narracion_minimax.py         # genera la narración
"""

import json
import os
import sys
import urllib.error
import urllib.request

from narracion import GUION, SALIDA_AUDIO, SALIDA_JSON, duracion_segundos

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)

API = "https://api.minimax.io/v1"

# speech-2.6-hd: la variante "hd" suena mejor que la "turbo" y acá no importa
# que sea más lenta, son ocho frases que se generan una sola vez.
MODELO = "speech-2.6-hd"

# Se llena después de oír lo que devuelva `voces`. Dejarlo vacío a propósito:
# inventar un voice_id que no existe falla con un error que no dice nada.
VOZ = ""

VELOCIDAD = 0.95  # un pelo más lento que lo normal; narrando se agradece


def clave():
    """Lee la clave del .env sin imprimirla nunca."""
    ruta = os.path.join(RAIZ, ".env")
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if linea.startswith("MINIMAX_API_KEY="):
                    return linea.split("=", 1)[1].strip().strip('"').strip("'")
    if os.environ.get("MINIMAX_API_KEY"):
        return os.environ["MINIMAX_API_KEY"]
    sys.exit(
        "Falta la clave. Cree video/.env con la línea:\n"
        "  MINIMAX_API_KEY=su-clave\n"
        "No la pegue en el código ni en el chat."
    )


def pedir(ruta, cuerpo):
    req = urllib.request.Request(
        f"{API}/{ruta}",
        data=json.dumps(cuerpo).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {clave()}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            datos = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"MiniMax respondió {e.code}: {e.read().decode('utf-8', 'replace')[:400]}")

    base = datos.get("base_resp", {})
    if base.get("status_code") not in (0, None):
        sys.exit(f"MiniMax: {base.get('status_code')} · {base.get('status_msg')}")
    return datos


def listar_voces():
    datos = pedir("get_voice", {"voice_type": "system"})
    encontradas = []
    for grupo in datos.values():
        if not isinstance(grupo, list):
            continue
        for v in grupo:
            if not isinstance(v, dict):
                continue
            vid = v.get("voice_id", "")
            nombre = v.get("voice_name", "")
            if "spanish" in (vid + nombre).lower() or "es-" in vid.lower():
                encontradas.append((vid, nombre))

    if not encontradas:
        print("No se encontró ninguna voz en español. Respuesta completa:")
        print(json.dumps(datos, ensure_ascii=False, indent=2)[:3000])
        return

    print(f"{len(encontradas)} voces en español:\n")
    for vid, nombre in sorted(set(encontradas)):
        print(f"  {vid:<38} {nombre}")
    print("\nPonga el voice_id elegido en VOZ, arriba en este archivo.")


def sintetizar(texto, ruta):
    datos = pedir("t2a_v2", {
        "model": MODELO,
        "text": texto,
        "stream": False,
        "language_boost": "Spanish",
        "output_format": "hex",
        "voice_setting": {"voice_id": VOZ, "speed": VELOCIDAD, "vol": 1.0, "pitch": 0},
        # wav y no mp3: Chrome, que es quien renderiza los cuadros en Remotion,
        # reproduce los dos, pero el wav no vuelve a comprimir lo que después
        # se comprime otra vez al armar el mp4.
        "audio_setting": {"sample_rate": 44100, "format": "wav", "channel": 1},
    })

    hexa = datos.get("data", {}).get("audio")
    if not hexa:
        sys.exit(f"MiniMax no devolvió audio: {json.dumps(datos)[:400]}")

    with open(ruta, "wb") as f:
        f.write(bytes.fromhex(hexa))


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "voces":
        return listar_voces()

    if not VOZ:
        sys.exit(
            "Falta elegir la voz.\n"
            "Corra primero:  python3 herramientas/narracion_minimax.py voces\n"
            "y ponga el voice_id en la constante VOZ de este archivo."
        )

    os.makedirs(SALIDA_AUDIO, exist_ok=True)
    clips = []

    for item in GUION:
        nombre = f"{item['id']}.wav"
        ruta = os.path.join(SALIDA_AUDIO, nombre)
        sintetizar(item["texto"], ruta)

        seg = duracion_segundos(ruta)
        clips.append({
            "id": item["id"],
            "texto": item["texto"],
            "archivo": f"audio/{nombre}",
            "segundos": round(seg, 3),
        })
        print(f"{item['id']:<14} {seg:6.2f}s  {nombre}")

    with open(SALIDA_JSON, "w", encoding="utf-8") as f:
        json.dump({"voz": VOZ, "modelo": MODELO, "clips": clips}, f,
                  ensure_ascii=False, indent=2)
        f.write("\n")

    total = sum(c["segundos"] for c in clips)
    print(f"\nTotal hablado: {total:.1f}s · {SALIDA_JSON}")
    print("Falta: ./herramientas/musica.sh && npm run render")


if __name__ == "__main__":
    sys.exit(main())
