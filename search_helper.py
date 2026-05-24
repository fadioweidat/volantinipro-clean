import re
import sys

# Force stdout to be utf-8 to avoid Windows encoding issues with special chars
sys.stdout.reconfigure(encoding='utf-8')

def search_pattern(pattern, file_path):
    regex = re.compile(pattern, re.IGNORECASE)
    with open(file_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f, 1):
            if regex.search(line):
                print(f"{idx}: {line.strip()}")

if __name__ == '__main__':
    pattern = sys.argv[1]
    file_path = sys.argv[2]
    search_pattern(pattern, file_path)
