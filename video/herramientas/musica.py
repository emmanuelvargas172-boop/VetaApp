#!/usr/bin/env python3
"""
Genera la música de fondo del video.

Se sintetiza en vez de bajarse de un banco de pistas por dos razones: no hay
que creerle a nadie la licencia (esto se va a mandar por WhatsApp a clínicas,
no es un video privado), y dura exactamente lo que dure el video, sin cortes
a mitad de compás.

Es a propósito poca cosa: un colchón de acordes, unas notas sueltas tipo
kalimba y un bajo. Nada de batería. La música va debajo de una voz que está
explicando algo; si se nota, estorba.

Se corre con:  python3 herramientas/musica.py 55
(el número son los segundos; si falta, se leen de src/narracion.json)
"""

import json
import os
import struct
import sys
import wave

import numpy as np

SR = 44100
BPM = 76
COMPAS = 4 * 60.0 / BPM  # segundos por compás de 4/4

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
SALIDA = os.path.join(RAIZ, "public", "audio", "musica.wav")

# Do mayor, vuelta de cuatro compases. Es la progresión más común que existe
# (I - V - vi - IV) y eso es justamente lo que se quiere: que no llame la
# atención. Cada acorde trae sus notas y su bajo, en número de nota MIDI.
VUELTA = [
    {"acorde": [60, 64, 67], "bajo": 36},  # Do
    {"acorde": [59, 62, 67], "bajo": 43},  # Sol
    {"acorde": [57, 60, 64], "bajo": 45},  # La menor
    {"acorde": [53, 57, 60], "bajo": 41},  # Fa
]

# Dónde caen las notas sueltas dentro del compás, en corcheas. Dejar huecos
# (1, 4, 6) es lo que la hace sonar tranquila en vez de maquinal.
CORCHEAS = [0, 3, 4, 6]


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12.0)


def colchon(midi, dur, detune=0.0):
    """Acorde sostenido: armónicos suaves, entrada lenta, cola larga."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(midi) * (1 + detune)
    y = np.zeros(n)
    # Pocos armónicos y cayendo rápido: con muchos suena a órgano de feria.
    for h, amp in ((1, 1.0), (2, 0.34), (3, 0.12), (4, 0.05)):
        y += amp * np.sin(2 * np.pi * f * h * t + h * 0.7)

    ataque = np.clip(t / 0.75, 0, 1)
    salida = np.clip((dur - t) / 0.9, 0, 1)
    # Temblor muy lento: sin esto el acorde suena a sintetizador quieto.
    tremolo = 1 + 0.06 * np.sin(2 * np.pi * 0.17 * t)
    return y * ataque * salida * tremolo * 0.14


def pulsada(midi, dur):
    """Nota suelta tipo kalimba: ataque instantáneo y caída corta."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    y = (np.sin(2 * np.pi * f * t)
         + 0.42 * np.sin(2 * np.pi * f * 2 * t)
         + 0.16 * np.sin(2 * np.pi * f * 3.01 * t))
    env = np.exp(-t / 0.42) * (1 - np.exp(-t / 0.004))
    return y * env * 0.2


def bajo(midi, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    y = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * f * 2 * t)
    env = np.clip(t / 0.3, 0, 1) * np.clip((dur - t) / 0.5, 0, 1) * np.exp(-t / 2.6)
    return y * env * 0.3


def reverb(x, segundos=1.7, mezcla=0.26):
    """
    Reverberación por convolución contra ruido que decae.

    Sin esto las notas suenan pegadas al oído y se pelean con la voz; con la
    cola, la música se oye 'atrás' y la narración queda adelante sola.
    """
    n = int(segundos * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(7)  # semilla fija: la misma música siempre
    ir = rng.standard_normal(n) * np.exp(-t * 3.4)
    ir[0] = 1.0
    mojado = np.convolve(x, ir, mode="full")[: len(x)]
    mojado /= np.max(np.abs(mojado)) + 1e-9
    return (1 - mezcla) * x + mezcla * mojado * np.max(np.abs(x))


def sumar(destino, trozo, inicio):
    i = int(inicio * SR)
    fin = min(len(destino), i + len(trozo))
    if fin > i:
        destino[i:fin] += trozo[: fin - i]


def generar(total_seg):
    n = int(total_seg * SR)
    izq = np.zeros(n + SR * 3)
    der = np.zeros(n + SR * 3)

    compas = 0
    while compas * COMPAS < total_seg:
        paso = VUELTA[compas % len(VUELTA)]
        t0 = compas * COMPAS

        # El colchón dura compás y medio para que un acorde alcance a montarse
        # sobre el siguiente y no se oiga el corte.
        for k, nota in enumerate(paso["acorde"]):
            for lado, detune in ((izq, -0.0012), (der, 0.0012)):
                sumar(lado, colchon(nota, COMPAS * 1.5, detune), t0)
            # La nota del medio se abre a los lados; las otras quedan al centro
            if k == 1:
                sumar(izq, colchon(nota + 12, COMPAS * 1.5, -0.002) * 0.4, t0)

        sumar(izq, bajo(paso["bajo"], COMPAS), t0)
        sumar(der, bajo(paso["bajo"], COMPAS), t0)

        for j, corchea in enumerate(CORCHEAS):
            nota = paso["acorde"][j % len(paso["acorde"])] + 12
            t = t0 + corchea * (COMPAS / 8)
            p = pulsada(nota, 1.4)
            # Las notas sueltas se van alternando de lado: da aire sin que se
            # note que es un truco.
            sumar(izq, p * (0.75 if j % 2 == 0 else 0.45), t)
            sumar(der, p * (0.45 if j % 2 == 0 else 0.75), t)

        compas += 1

    izq, der = izq[:n], der[:n]
    izq, der = reverb(izq), reverb(der)

    # Entrada y salida. La salida es larga para que la música no se corte seca
    # cuando termina la última frase.
    t = np.arange(n) / SR
    entrada = np.clip(t / 2.0, 0, 1)
    salida = np.clip((total_seg - t) / 3.5, 0, 1)
    izq *= entrada * salida
    der *= entrada * salida

    pico = max(np.max(np.abs(izq)), np.max(np.abs(der))) + 1e-9
    izq, der = izq / pico * 0.72, der / pico * 0.72
    return izq, der


def escribir(izq, der, ruta):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    inter = np.empty(len(izq) * 2, dtype=np.int16)
    inter[0::2] = np.int16(np.clip(izq, -1, 1) * 32767)
    inter[1::2] = np.int16(np.clip(der, -1, 1) * 32767)
    with wave.open(ruta, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(inter.tobytes())


def main():
    if len(sys.argv) > 1:
        total = float(sys.argv[1])
    else:
        with open(os.path.join(RAIZ, "src", "narracion.json"), encoding="utf-8") as f:
            total = sum(c["segundos"] for c in json.load(f)["clips"]) + 20
    izq, der = generar(total)
    escribir(izq, der, SALIDA)
    print(f"{total:.1f}s · {SALIDA}")


if __name__ == "__main__":
    sys.exit(main())
