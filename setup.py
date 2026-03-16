#!/usr/bin/env python3
"""
The Dugout — One-time setup
Saves your Anthropic API key to .env so the app never asks for it again.
"""
import os

ENV_FILE = os.path.join(os.path.dirname(__file__), ".env")

print("\n🏟️  THE DUGOUT — Setup\n")

# Check if already set
if os.path.exists(ENV_FILE):
    print("✅ .env file already exists.")
    overwrite = input("   Overwrite with a new key? (y/n): ").strip().lower()
    if overwrite != 'y':
        print("   No changes made.\n")
        exit()

key = input("Paste your Anthropic API key (sk-ant-...): ").strip()

if not key.startswith("sk-ant-"):
    print("⚠️  That doesn't look like a valid Anthropic API key.")
    exit(1)

with open(ENV_FILE, "w") as f:
    f.write(f"ANTHROPIC_API_KEY={key}\n")

print(f"\n✅ API key saved to .env")
print("   Run 'python3 server.py' to start the app.\n")
