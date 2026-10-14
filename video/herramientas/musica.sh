#!/bin/sh
# Genera la música con la duración exacta del video.
#
# El largo no se escribe a mano porque cambia solo: las duraciones de los
# tiempos salen de cuánto dura cada frase de la narración. Se le pregunta a
# Remotion cuántos cuadros tiene la composición y se dividen por los fps, así
# la música siempre termina de desvanecerse justo cuando termina el video.
set -e
cd "$(dirname "$0")/.."

linea=$(npx remotion compositions src/index.jsx 2>/dev/null | grep '^Veta')
if [ -z "$linea" ]; then
  echo "No se pudo leer la duración de la composición." >&2
  exit 1
fi

segundos=$(echo "$linea" | awk '{printf "%.2f", $4 / $2}')
echo "Composición: $linea"
exec python3 herramientas/musica.py "$segundos"
