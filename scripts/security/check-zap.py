"""Bloqueia alertas altos e relatorios ausentes/invalidos do ZAP."""

import json
import sys
from pathlib import Path
from urllib.parse import urlsplit


def check_report(path):
    report = json.loads(Path(path).read_text(encoding="utf-8"))
    sites = report["site"]
    if not isinstance(sites, list) or not sites:
        raise ValueError("O relatorio nao contem sites analisados.")
    counts = [0, 0, 0, 0]
    for site in sites:
        target = urlsplit(site.get("@name", ""))
        if target.scheme != "http" or target.netloc != "127.0.0.1:4173":
            raise ValueError("O relatorio contem um alvo fora do escopo local.")
        alerts = site["alerts"]
        if not isinstance(alerts, list):
            raise ValueError("Lista de alertas invalida.")
        for alert in alerts:
            risk = int(alert["riskcode"])
            if risk not in range(4):
                raise ValueError("Severidade desconhecida.")
            counts[risk] += 1
    print(f"ZAP: {counts[3]} altos, {counts[2]} medios, "
          f"{counts[1]} baixos, {counts[0]} informativos.")
    return 1 if counts[3] else 0


if __name__ == "__main__":
    try:
        sys.exit(check_report(sys.argv[1]))
    except (OSError, ValueError, KeyError, TypeError, IndexError) as error:
        print(f"Falha ao validar relatorio ZAP: {error}", file=sys.stderr)
        sys.exit(1)
