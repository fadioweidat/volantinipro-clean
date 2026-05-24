path = "volantinipro-final.jsx"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

balance = 0
for i, line in enumerate(lines):
    balance += line.count("{")
    balance -= line.count("}")
    if "function " in line or "const " in line and "=>" in line:
        if balance > 1 and "Step" in line: # Functions at top level should be 0 before starting
             print(f"Line {i+1}: Balance={balance} - {line.strip()}")

# Let's also check the very end of Step2
print(f"Balance at line 3172: {sum(l.count('{') - l.count('}') for l in lines[:3172])}")
print(f"Balance at line 3173: {sum(l.count('{') - l.count('}') for l in lines[:3173])}")
print(f"Balance at line 3174: {sum(l.count('{') - l.count('}') for l in lines[:3174])}")
