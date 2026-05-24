import os

path = "volantinipro-final.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Comprehensive mapping of broken byte sequences to correct characters
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
    "ðŸ—“": "🗓️",
    "ðŸ“†": "📆",
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
    "ðŸ”": "🔥",
    "ðŸŒ🌟": "🌟",
    "ðŸŒŸ": "🌟",
    "ðŸ’¬": "💬",
    "ðŸ“±": "📱",
    "ðŸ“§": "📧",
    "ðŸ’°": "💰",
    "ðŸš€": "🚀",
    "ðŸ“ˆ": "📈",
    "ðŸ“‰": "📉",
    "ðŸ—️": "🗓️",
    "ðŸ“…": "📅",
    "â†'": "→",
    "â† ": "←",
    "â€“": "–",
    "Ã ": "à",
    "Ã¨": "è",
    "Ã¬": "ì",
    "Ã²": "ò",
    "Ã¹": "ù",
    "Ã©": "é",
    "Ã": "à", # Fallback
}

for old, new in replacements.items():
    content = content.replace(old, new)

# Surgical fix for things like "📅…"
content = content.replace("📅…", "📅")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Comprehensive replacement complete.")
