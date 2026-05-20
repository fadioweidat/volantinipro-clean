import os

path = "volantinipro-final.jsx"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Fix ACTIVITY_TYPES (line 749 -> index 748)
if "ACTIVITY_TYPES" in lines[748]:
    lines[748] = 'const ACTIVITY_TYPES = [{ value: "ristorante", label: "🍕 Ristorante / Bar" }, { value: "negozio", label: "🛍️ Negozio / Retail" }, { value: "supermercato", label: "🛒 Supermercato / Alimentari" }, { value: "palestra", label: "💪 Palestra / Sport" }, { value: "immobiliare", label: "🏠 Agenzia Immobiliare" }, { value: "estetica", label: "💅 Estetica / Benessere" }, { value: "farmacia", label: "💊 Farmacia" }, { value: "dental", label: "🦷 Studio Medico" }, { value: "auto", label: "🚗 Concessionaria / Auto" }, { value: "scuola", label: "📚 Scuola / Formazione" }, { value: "eventi", label: "🎉 Eventi / Locali" }, { value: "ecommerce", label: "📦 E-commerce / Delivery" }, { value: "altro", label: "⚙️ Altro" }];\n'

# Fix H2H_HOTSPOT_META (line 771 -> index 770)
if "retail:" in lines[770]:
    lines[770] = '  retail: { label: "Shopping / strade attive", color: "#FBBF24", icon: "🛍️" },\n'

# Fix Step 1 date icons (search for them)
for i in range(len(lines)):
    if "ðŸ“" in lines[i]:
        lines[i] = lines[i].replace("ðŸ“", "📅")
    if "ðŸŽ¯" in lines[i]:
        lines[i] = lines[i].replace("ðŸŽ¯", "🎯")
    if "ðŸ •" in lines[i]:
        lines[i] = lines[i].replace("ðŸ •", "🍕")
    if "ðŸ› " in lines[i]:
        lines[i] = lines[i].replace("ðŸ› ", "🛍️")
    if "ðŸ  " in lines[i]:
        lines[i] = lines[i].replace("ðŸ  ", "🏠")
    if "Ã " in lines[i]:
        lines[i] = lines[i].replace("Ã ", "à")
    if "â€“" in lines[i]:
        lines[i] = lines[i].replace("â€“", "–")

with open(path, "w", encoding="utf-8") as f:
    f.writelines(lines)

print("Line-based replacement complete.")
