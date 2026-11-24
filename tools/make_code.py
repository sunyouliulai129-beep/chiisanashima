"""島民コードを作って data.json に「ハッシュだけ」保存する。
使い方: python3 tools/make_code.py <residents の id>
画面に出たコードは、その本人にだけインスタのDMで送る。コードそのものはどこにも保存・公開しない。"""
import hashlib, json, secrets, sys
ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # まぎらわしい I O 0 1 は使わない
rid = sys.argv[1]
d = json.load(open("data.json", encoding="utf-8"))
r = next((x for x in d["residents"] if x["id"] == rid), None)
if r is None:
    sys.exit("その id の島民がいません: " + rid)
code = "".join(secrets.choice(ALPHA) for _ in range(8))
salt = secrets.token_hex(8)
r["code_salt"] = salt
r["code_hash"] = hashlib.sha256((salt + ":" + code).encode()).hexdigest()
json.dump(d, open("data.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(code[:4] + "-" + code[4:])
