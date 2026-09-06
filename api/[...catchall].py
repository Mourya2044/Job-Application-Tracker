import sys
from pathlib import Path

# Add the 'python' folder to sys.path so app modules are resolvable by Vercel
ROOT_DIR = Path(__file__).resolve().parent.parent
PYTHON_DIR = ROOT_DIR / "python"

if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from app.main import app
