import os

path = "volantinipro-final.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Final exhaustive mapping including Map Dashboard icons
replacements = {
    "ðŸ •": "🍕",
    "ðŸ› ": "🛍️",
    "ðŸ›’": "🛒",
    "ðŸ’ª": "💪",
    "ðŸ  ": "🏠",
    "ðŸ’…": "💅",
    "ðŸ’Š": "💊",
    "ðŸ·": "🦷",
    "ðŸš—": "🚗",
    "ðŸ“š": "📚",
    "ðŸŽ‰": "🎉",
    "ðŸ“¦": "📦",
    "âš™ï¸ ": "⚙️",
    "ðŸ“": "📅",
    "ðŸŽ¯": "🎯",
    "ðŸš‡": "🚇",
    "ðŸŽ“": "🎓",
    "ðŸš¶": "🚶",
    "ðŸ›°": "🛰️",
    "ðŸ“¸": "📸",
    "ðŸ¤–": "🤖",
    "ðŸ“Š": "📊",
    "âœ…": "✅",
    "âœ“": "✅",
    "ðŸŽ ": "🎭",
    "ðŸ–¨": "🖨️",
    "ðŸ’ ": "💼",
    "Ã ": "à",
    "Ã¨": "è",
    "Ã¬": "ì",
    "Ã²": "ò",
    "Ã¹": "ù",
    "â€“": "–",
    "ðŸ“ ": "📅",
    "ðŸ…": "📅",
    "Ã": "à",
}

# Catch remaining broken emoji patterns in Map Dashboard
# These often look like ðŸ followed by some symbols in the raw file
import re
# This regex targets sequences starting with the broken UTF-8 head for emojis
content = re.sub(r'ðŸ[^\s"\'\}]{1,3}', '📍', content)

# Apply standard replacements after regex to ensure specific ones are correct
for old, new in replacements.items():
    content = content.replace(old, new)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Final cleanup complete.")
