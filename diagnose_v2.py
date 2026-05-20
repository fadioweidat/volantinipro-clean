path = "volantinipro-final.jsx"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

balance = 0
step2_start = -1
for i, line in enumerate(lines):
    if "function Step2" in line:
        step2_start = i
        balance = 0
    
    if step2_start != -1:
        balance += line.count("{")
        balance -= line.count("}")
        if balance < 0:
            print(f"ERROR: Negative balance at line {i+1}: {line.strip()}")
            break
        if "function Step3" in line:
            print(f"Balance at Step3: {balance}")
            break

# Let's fix line 2223 first (index 2222)
if "📍/span>" in lines[2222]:
    lines[2222] = lines[2222].replace("📍/span>", "📍</span>")

# If balance at Step3 is 1, it means we are missing a closing brace.
# I'll look for where the last block in Step2 ends.
# Usually Step2 ends with:
#   );
# }

# I'll try to find the return statement of Step2 and its closing.
found_return = -1
for i in range(step2_start, len(lines)):
    if "return (" in lines[i]:
        found_return = i
    if found_return != -1 and "function Step3" in lines[i]:
        # We found Step3 but Step2 didn't close correctly.
        # Let's look at the lines just before Step3.
        print(f"Lines before Step3: {lines[i-3:i]}")
        break

with open(path, "w", encoding="utf-8") as f:
    f.writelines(lines)
