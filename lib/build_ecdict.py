# pip install wordfreq
import os, csv, json
from wordfreq import top_n_list

BASE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE, "ecdict.csv")
OUT_PATH = os.path.join(BASE, "dictionary.json")

TOP_N   = 20000   
MAX_EX  = 3
PRETTY  = True
INDENT  = 2

def clean_list(s: str):
    if not s: return []
    for sep in ['\r\n','\n','；',';','。']:
        s = s.replace(sep, '\n')
    seen, out = set(), []
    for p in (x.strip() for x in s.split('\n')):
        if p and p not in seen:
            seen.add(p); out.append(p)
    return out

def first_nonempty(*vals):
    for v in vals:
        if v:
            v = v.strip()
            if v: return v
    return ""

def main():
    common = set(w.lower() for w in top_n_list("en", TOP_N))

    out = {}
    kept = 0
    with open(CSV_PATH, "r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            term = (row.get("word") or "").strip().lower()
            if not term or term not in common:
                continue

            entry = out.get(term) or {"translation":"","definition":"","examples":[],"phonetic":""}
            t = first_nonempty(row.get("translation"))
            d = first_nonempty(row.get("definition"))
            e = clean_list(row.get("example"))
            p = first_nonempty(row.get("phonetic"))

            if t and not entry["translation"]: entry["translation"] = t
            if d and not entry["definition"]:  entry["definition"]  = d
            if e: entry["examples"] = list(dict.fromkeys(entry["examples"] + e))[:MAX_EX]
            if p and not entry["phonetic"]:    entry["phonetic"]    = p

            out[term] = entry
            kept += 1

    with open(OUT_PATH, "w", encoding="utf-8") as w:
        if PRETTY:
            json.dump(out, w, ensure_ascii=False, indent=INDENT, sort_keys=True)
        else:
            json.dump(out, w, ensure_ascii=False, separators=(",", ":"))

    print(f"done: kept {kept} / wrote -> {OUT_PATH}")

if __name__ == "__main__":
    main()
