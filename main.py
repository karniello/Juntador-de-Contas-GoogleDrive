#!/usr/bin/env python3
"""
Ponto de entrada unificado para o Google Drive Virtual Storage Pool.
Suporta execução tanto via Linha de Comando (CLI) quanto via Interface Gráfica (GUI).

Uso:
  python main.py               -> Abre a Interface Gráfica Desktop (CustomTkinter/Tkinter)
  python main.py gui           -> Abre a Interface Gráfica Desktop
  python main.py list          -> Lista arquivos unificados e cota total do Pool
  python main.py upload <arq>  -> Envia arquivo usando alocação Most Free Space (MFS)
  python main.py download <id> <destino> -> Baixa arquivo do Google Drive
  python main.py delete <id>   -> Exclui arquivo do Google Drive e do SQLite
  python main.py auth          -> Autentica as contas do Google Drive
"""

import sys
import os

# Adiciona o diretório atual ao sys.path para importação limpa
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from drive_pool.cli import run_cli


def main():
    # Se nenhum argumento for passado ou se o primeiro argumento for 'gui' ou '--gui'
    if len(sys.argv) == 1 or (len(sys.argv) == 2 and sys.argv[1].lower() in ["gui", "--gui"]):
        try:
            from drive_pool.gui import run_gui
            print("Iniciando interface gráfica desktop...")
            run_gui()
        except Exception as e:
            print(f"Não foi possível iniciar a interface gráfica ({e}).")
            print("Executando modo CLI alternativo:")
            run_cli()
    else:
        run_cli()


if __name__ == "__main__":
    main()
