import sys

path = "volantinipro-final.jsx"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

stack = []
line_num = 1
col_num = 1
for i, char in enumerate(content):
    if char == '{':
        stack.append((line_num, col_num))
    elif char == '}':
        if not stack:
            print(f"ERROR: Unmatched }} at line {line_num}, col {col_num}")
        else:
            stack.pop()
    
    if char == '\n':
        line_num += 1
        col_num = 1
    else:
        col_num += 1

if stack:
    print(f"ERROR: {len(stack)} unclosed {{ found:")
    for l, c in stack:
        print(f"  Unclosed {{ at line {l}, col {c}")
        # Print a snippet of the line
        f_lines = content.splitlines()
        print(f"  Snippet: {f_lines[l-1][max(0, c-20):c+20]}")
else:
    print("All braces are balanced.")
