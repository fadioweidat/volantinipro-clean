path = "volantinipro-final.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Fix the broken span tag found
content = content.replace("📍/span>", "📍</span>")
content = content.replace("??/span>", "📍</span>") # Fallback for what grep showed

# Let's also fix the mojibake that appeared in Step 2/3 (â†’, â† , etc.)
replacements = {
    "â†'": "→",
    "â† ": "←",
    "â€“": "–",
    "Ã ": "à",
    "Ã¨": "è",
    "Ã¬": "ì",
    "Ã²": "ò",
    "Ã¹": "ù",
    "Ã©": "é",
    "Ã": "à",
}
for old, new in replacements.items():
    content = content.replace(old, new)

# Now let's check for unbalanced braces up to Step 3
lines = content.splitlines()
open_braces = 0
for i, line in enumerate(lines):
    open_braces += line.count("{")
    open_braces -= line.count("}")
    if "function Step3" in line:
        print(f"Brace balance at Step 3 (line {i+1}): {open_braces}")
        if open_braces != 0:
            print("ERROR: Unbalanced braces before Step 3!")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)
