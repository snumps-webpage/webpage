/**
 * `assets` 버킷을 **비공개로 전환**한다 (감사 C-22 / OPERATOR-TODO §3-1).
 *
 * 왜 자동화하나: 콘솔 토글 하나지만, 그 하나가 "자산 차단이 실제로 걸렸는가"를
 * 가른다. 앱은 이미 `/media/<key>`로만 링크하고 요청마다 권한을 판정하지만,
 * 버킷이 공개로 남아 있으면 **예전에 나간 공개 URL이 그대로 살아 있다.**
 * 손으로 하면 "했다고 생각했는데 안 된" 상태가 조용히 남는다 — 그래서 전환과
 * 확인을 한 명령으로 묶는다.
 *
 *   node scripts/ops/ops-assets-private.mjs            # 현재 상태만 본다(기본)
 *   node scripts/ops/ops-assets-private.mjs --apply    # 실제로 비공개 전환
 *
 * 기본이 읽기 전용인 이유: 이 스크립트는 **운영 저장소**를 바꾼다. 되돌리는 것은
 * `--public`으로 가능하지만, 그 사이 공개 URL은 다시 살아난다.
 *
 * 필요한 env (리포 루트 `.env`를 있으면 읽는다):
 *   SUPABASE_URL, SUPABASE_SECRET_KEY, (선택) SUPABASE_ASSETS_BUCKET
 */
import { createClient } from "@supabase/supabase-js";
import { loadDotenv } from "./lib-env.mjs";

loadDotenv();

const apply = process.argv.includes("--apply");
const makePublic = process.argv.includes("--public");
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const bucket = process.env.SUPABASE_ASSETS_BUCKET || "assets";

if (!url || !key) {
  console.error(
    "env missing: SUPABASE_URL / SUPABASE_SECRET_KEY (리포 루트 .env 또는 환경변수)",
  );
  process.exit(1);
}

const sb = createClient(url, key);
const target = makePublic ? true : false;

/** 버킷 목록에서 이름·공개여부를 읽는다. */
async function bucketState() {
  const { data, error } = await sb.storage.listBuckets();
  if (error) throw new Error(`listBuckets: ${error.message}`);
  const found = data.find((b) => b.name === bucket);
  if (!found) throw new Error(`버킷 "${bucket}" 이 없다 — 이름을 확인할 것`);
  return { all: data, assets: found };
}

/**
 * 전환이 **실제로** 걸렸는지 두 방향으로 확인한다.
 *  ① 공개 URL은 거부돼야 한다(차단의 증거)
 *  ② 서명 URL은 여전히 200이어야 한다(사이트가 살아 있다는 증거)
 * 객체가 하나도 없으면 확인을 건너뛴다 — 빈 버킷은 증거를 만들 수 없다.
 */
async function verify() {
  const { data: files, error } = await sb.storage
    .from(bucket)
    .list("", { limit: 100 });
  if (error) throw new Error(`list: ${error.message}`);

  // 최상위는 대개 폴더다(created_at: null). 한 단계 내려가 실제 객체를 찾는다.
  let probe = files?.find((f) => f.created_at);
  if (!probe) {
    for (const folder of files ?? []) {
      const { data: inner } = await sb.storage
        .from(bucket)
        .list(folder.name, { limit: 100 });
      const file = inner?.find((f) => f.created_at);
      if (file) {
        probe = { name: `${folder.name}/${file.name}` };
        break;
      }
      for (const sub of inner ?? []) {
        const { data: deeper } = await sb.storage
          .from(bucket)
          .list(`${folder.name}/${sub.name}`, { limit: 100 });
        const deepFile = deeper?.find((f) => f.created_at);
        if (deepFile) {
          probe = { name: `${folder.name}/${sub.name}/${deepFile.name}` };
          break;
        }
      }
      if (probe) break;
    }
  }
  if (!probe) {
    console.log("· 확인 생략: 버킷에 객체가 없다");
    return;
  }

  const publicUrl = `${url.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${probe.name}`;
  const publicRes = await fetch(publicUrl, { method: "GET" });
  const publicBlocked = !publicRes.ok;

  const { data: signed, error: signError } = await sb.storage
    .from(bucket)
    .createSignedUrl(probe.name, 60);
  if (signError) throw new Error(`createSignedUrl: ${signError.message}`);
  const signedRes = await fetch(signed.signedUrl, { method: "GET" });

  console.log(`· 확인 대상: ${probe.name}`);
  console.log(
    `  공개 URL  → ${publicRes.status} ${publicBlocked ? "(차단됨 ✅)" : "(아직 열려 있다 ❌)"}`,
  );
  console.log(
    `  서명 URL  → ${signedRes.status} ${signedRes.ok ? "(정상 ✅)" : "(앱이 파일을 못 읽는다 ❌)"}`,
  );

  if (!makePublic && !publicBlocked) {
    console.error(
      "\n공개 URL이 아직 응답한다. 전환이 반영되지 않았거나 CDN 캐시가 남아 있다.",
    );
    process.exitCode = 1;
  }
  if (!signedRes.ok) {
    console.error(
      "\n서명 URL이 실패한다 — 이 상태로 두면 사이트의 이미지·자료가 전부 깨진다.",
    );
    process.exitCode = 1;
  }
}

const before = await bucketState();
console.log(`프로젝트: ${url}`);
for (const b of before.all) console.log(`  ${b.name} public=${b.public}`);

if (before.assets.public === target) {
  console.log(`\n"${bucket}" 은 이미 public=${target} 이다 — 바꿀 것이 없다.`);
  await verify();
  process.exit(process.exitCode ?? 0);
}

if (!apply) {
  console.log(
    `\n현재 "${bucket}" public=${before.assets.public}. 전환하려면 --apply 를 붙일 것.` +
      `\n(이 스크립트는 기본적으로 아무것도 바꾸지 않는다)`,
  );
  process.exit(0);
}

const { error: updateError } = await sb.storage.updateBucket(bucket, {
  public: target,
});
if (updateError) {
  console.error(`updateBucket: ${updateError.message}`);
  process.exit(1);
}

const after = await bucketState();
console.log(`\n"${bucket}" public=${after.assets.public} 로 전환했다.`);
if (after.assets.public !== target) {
  console.error("전환이 반영되지 않았다 — 권한(service key)을 확인할 것.");
  process.exit(1);
}

await verify();
process.exit(process.exitCode ?? 0);
