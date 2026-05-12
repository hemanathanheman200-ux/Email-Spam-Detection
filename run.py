"""
Start SpamGuard AI from this folder — always loads the correct app (avoids Flask 404).

Run (PowerShell), from directory that contains run.py:
    landingenv\\Scripts\\python.exe run.py

Or after: landingenv\\Scripts\\Activate.ps1
    python run.py
"""

from app import app

if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
