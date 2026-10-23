import os, sys
from pathlib import Path
import webview
BASE = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
WEB = BASE / 'web'
if __name__ == '__main__':
    webview.create_window('MediLink Médecin', str(WEB / 'index.html'), width=1280, height=820, min_size=(980,650))
    webview.start(debug=False, private_mode=True)
