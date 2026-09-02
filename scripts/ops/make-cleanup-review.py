import glob
import json

dump = sorted(glob.glob("scripts/migration/out/dump-*"))[-1]
targets = {
    "private-info": [
        "3512f5f5-b3ac-815d-b583-f5061f8b3fa1",
        "3512f5f5-b3ac-8130-b83b-ff687208a01f",
        "3442f5f5-b3ac-81ca-9502-d3b717a14e0d",
        "3322f5f5-b3ac-8100-8ae1-d14632ee7d29",
        "3322f5f5-b3ac-817c-822f-e035f31738a4",
        "3322f5f5-b3ac-81e9-aada-fd194886f8a1",
        "3242f5f5-b3ac-81ba-aad7-c69a97fe7ff2",
        "3242f5f5-b3ac-8111-90e1-e22b074ade0f",
        "3242f5f5-b3ac-81c1-8740-edb9d592fa34",
        "3192f5f5-b3ac-8165-8e02-fe2f50a028cd",
        "3172f5f5-b3ac-81ff-97ae-e5cbd75baba7",
    ],
    "activities": [
        "3902f5f5-b3ac-8002-9cb5-c3a65c278a97",
        "34d2f5f5-b3ac-817e-b39a-de22a4208c1c",
    ],
    "seminars": ["3172f5f5-b3ac-8020-b69f-c730f494cbc3"],
}
label = {
    "private-info": "회원 relation 없음 (소유자 불명 — 연결하거나 삭제)",
    "activities": "일정(start) 없음 — 날짜 입력",
    "seminars": "학기 미기입 — 학기 입력",
}


def title_of(page):
    for p in page.get("properties", {}).values():
        if p.get("type") == "title":
            return "".join(t.get("plain_text", "") for t in p.get("title", [])) or "(제목 없음)"
    return "(제목 없음)"


out = ["# 노션 원본 정리 대상 14건 (이주 전 필수)", ""]
for db, ids in targets.items():
    pages = {p["id"]: p for p in json.load(open(f"{dump}/{db}.json"))["pages"]}
    out.append(f"## {db} — {label[db]}")
    for i in ids:
        p = pages.get(i)
        url = p.get("url") if p else f"https://notion.so/{i.replace('-', '')}"
        out.append(f"- [{title_of(p) if p else i}]({url})")
    out.append("")
open("scripts/migration/out/CLEANUP-REVIEW.md", "w").write("\n".join(out))
print(f"written: scripts/migration/out/CLEANUP-REVIEW.md")
