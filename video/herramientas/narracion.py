#!/usr/bin/env python3
"""
Genera la narración del video y la mide.

El texto hablado vive acá y no en datos.jsx porque la duración de cada tiempo
del video se calcula desde el audio: primero existe la frase dicha, después el
video se estira para que quepa. Al revés —video fijo, voz encima— la frase
queda cortada a mitad.

Deja dos cosas:
  video/public/audio/*.wav   el audio de cada frase
  video/src/narracion.json   el texto y los segundos que duró cada una

Se corre con:  python3 herramientas/narracion.py
"""

import json
import os
import re
import subprocess
import sys

# Voz del sistema. Mexicana y no de España: en una clínica de Medellín el
# acento peninsular suena a extranjero y distrae de lo que se está diciendo.
# Para cambiarla: say -v '?' lista las que hay instaladas.
VOZ = "Paulina"

# Palabras por minuto. La de fábrica (180) atropella; 165 deja respirar sin
# sonar lenta.
RITMO = 165

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
SALIDA_AUDIO = os.path.join(RAIZ, "public", "audio")
SALIDA_JSON = os.path.join(RAIZ, "src", "narracion.json")

# Lo que se dice, en orden. `id` amarra cada clip con su tiempo en datos.jsx.
#
# Los números van escritos con letra a propósito: la voz del sistema lee
# "$69.000" como "dólar sesenta y nueve punto cero cero cero", y el teléfono
# dígito por dígito se retiene mejor que "tres mil doscientos tres millones".
GUION = [
    {
        "id": "portada",
        "texto": "El cuaderno de citas, en el celular.",
    },
    {
        "id": "resumen",
        "texto": "Abres la app y ves las citas de hoy y las vacunas que urgen.",
    },
    {
        "id": "pacientes",
        "texto": "Cada mascota con su dueño y su teléfono, a un toque.",
    },
    {
        "id": "historias",
        "texto": "La historia clínica completa: qué le diagnosticó, qué le recetó y cuánto pesaba.",
    },
    {
        "id": "citas",
        "texto": "Las citas del cuaderno, en un calendario que no se pierde ni se moja.",
    },
    {
        "id": "inventario",
        "texto": "Qué se acabó, qué está por acabarse, y cuánta plata tiene parada en bodega.",
    },
    {
        # Dicho como manda el speech: la app arma, la veterinaria envía.
        # Prometerlo automático es la venta que se cae en la primera semana.
        "id": "recordatorios",
        "texto": "La app arma la lista de a quién le toca vacuna y escribe el mensaje. Usted da un clic y sale por WhatsApp.",
    },
    {
        "id": "cierre",
        # El teléfono no se dicta: dígito por dígito la voz se demoraba quince
        # segundos, y nadie apunta un número de oído mientras mira un video.
        # Se lee en pantalla, que para eso está escrito grande.
        "texto": "Esencial, sesenta y nueve mil al mes. Avanzado, noventa y nueve mil. "
                 "Ocho días de prueba, sin tarjeta. Escríbeme al WhatsApp.",
    },
]


def duracion_segundos(ruta):
    """Lee la duración real del wav con afinfo, que ya viene en macOS."""
    salida = subprocess.run(
        ["afinfo", ruta], capture_output=True, text=True, check=True
    ).stdout
    m = re.search(r"estimated duration: ([\d.]+) sec", salida)
    if not m:
        raise RuntimeError(f"afinfo no dio duración para {ruta}:\n{salida}")
    return float(m.group(1))


def main():
    os.makedirs(SALIDA_AUDIO, exist_ok=True)
    clips = []

    for item in GUION:
        nombre = f"{item['id']}.wav"
        ruta = os.path.join(SALIDA_AUDIO, nombre)

        # WAVE de 16 bits: el AIFF que say escribe por defecto no lo reproduce
        # Chrome, que es quien renderiza los cuadros en Remotion.
        subprocess.run(
            [
                "say", "-v", VOZ, "-r", str(RITMO),
                "--file-format=WAVE", "--data-format=LEI16@44100",
                "-o", ruta, item["texto"],
            ],
            check=True,
        )

        seg = duracion_segundos(ruta)
        clips.append({
            "id": item["id"],
            "texto": item["texto"],
            "archivo": f"audio/{nombre}",
            "segundos": round(seg, 3),
        })
        print(f"{item['id']:<14} {seg:6.2f}s  {nombre}")

    with open(SALIDA_JSON, "w", encoding="utf-8") as f:
        json.dump({"voz": VOZ, "ritmo": RITMO, "clips": clips}, f,
                  ensure_ascii=False, indent=2)
        f.write("\n")

    total = sum(c["segundos"] for c in clips)
    print(f"\nTotal hablado: {total:.1f}s · {SALIDA_JSON}")


if __name__ == "__main__":
    sys.exit(main())
