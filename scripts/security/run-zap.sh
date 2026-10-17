#!/usr/bin/env bash
set -euo pipefail

# O alvo e fixo: apenas a interface compilada desta execucao.
target='http://127.0.0.1:4173'
scan='zap-baseline.py'
if [[ "${ACTIVE_SCAN,,}" == 'true' ]]; then
  if [[ "$BUILD_REASON" != 'Manual' ]]; then
    echo 'O scan ativo exige uma execucao manual.' >&2
    exit 1
  fi
  scan='zap-full-scan.py'
fi

mkdir -p "$REPORT_DIR"
docker pull "$ZAP_IMAGE"
# O usuario zap do container precisa escrever os relatorios nesta pasta temporaria.
chmod 0777 "$REPORT_DIR"
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist \
  > "$REPORT_DIR/http-server.log" 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT

ready=false
for attempt in {1..30}; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo 'O servidor local encerrou antes do scan.' >&2
    exit 1
  fi
  if curl --fail --silent --output /dev/null "$target"; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo 'A interface local nao ficou disponivel.' >&2
  exit 1
fi

status=0
# Linux hosted agent: o container acessa o loopback do agente via host networking.
timeout --signal=TERM 20m docker run --rm --network host \
  -v "$REPORT_DIR:/zap/wrk:rw" "$ZAP_IMAGE" "$scan" \
  -t "$target" -m 2 -T 10 -j \
  -J zap.json -r zap.html -w zap.md || status=$?

# ZAP: 0=sucesso, 1=FAIL, 2=WARN, 3=erro. WARN passa pela politica abaixo.
if [[ "$status" != 0 && "$status" != 2 ]]; then
  echo "O ZAP falhou ou foi interrompido (codigo $status)." >&2
  exit "$status"
fi
python3 scripts/security/check-zap.py "$REPORT_DIR/zap.json"
