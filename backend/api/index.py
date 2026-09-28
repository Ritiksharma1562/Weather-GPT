import os
import sys

# backend folder ko Python path me add karo
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.main import app