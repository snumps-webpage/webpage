// 실측 하네스 전용 — scripts/measure/start.sh가 **격리 복사본에만** 이 파일을
// src/routes/api/__probe/+server.ts로 끼워 넣는다. 레포의 src/에는 두지 않는다:
// 운영 빌드에 존재하지 않는 것이 첫 번째 방어선이다.
//
// 그래도 복사본이 잘못 쓰일 때를 위해 가드를 한 겹 더 둔다 — dev 서버,
// 메모리 백엔드, 토큰 세 조건이 모두 맞을 때만 응답하고 아니면 404.
import { json, error, type RequestHandler } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import * as mem from "$lib/server/data/store-memory";
import { invalidateCache } from "$lib/server/cache";
import { _resetDataLayerForTests } from "$lib/server/data/tables";
import { TABLE_NAMES } from "$lib/server/data/schemas";

function guard(request: Request) {
  if (!dev || env.DATA_BACKEND !== "memory" || !env.PROBE_TOKEN)
    throw error(404);
  if (request.headers.get("x-probe") !== env.PROBE_TOKEN) throw error(404);
}

/** reset: 저장소와 캐시를 비운다. put/seed: 문서를 그대로 넣는다. */
export const POST: RequestHandler = async ({ request }) => {
  guard(request);
  const body = (await request.json()) as {
    op: "seed" | "put" | "reset";
    tables?: { name: string; doc: unknown }[];
    queues?: { event_id: string; doc: unknown }[];
  };
  if (body.op === "reset") {
    // 테이블 캐시는 저장소보다 오래 산다 — 전부 지우지 않으면 다음 실행이
    // 로컬 TTL 동안 이전 실행의 행을 읽는다.
    const queueIds = [...mem.__docs("queue").keys()];
    mem.__reset();
    for (const name of TABLE_NAMES) await invalidateCache(`table_${name}`);
    for (const id of queueIds)
      await invalidateCache(`table_attendance-queue_${id}`);
  }
  for (const t of body.tables ?? []) {
    mem.__putRawDoc("table", t.name, t.doc);
    await invalidateCache(`table_${t.name}`);
  }
  for (const q of body.queues ?? []) {
    mem.__putRawDoc("queue", q.event_id, q.doc);
    await invalidateCache(`table_attendance-queue_${q.event_id}`);
  }
  _resetDataLayerForTests({ backoffBaseMs: 50 });
  return json({ ok: true });
};

/**
 * 저장된 **원본** 문서 — zod 기본값이 씌워지기 전이다. 예: 이주 세미나는
 * publicationStatus가 없다(앱은 "published"로 읽는다). 판정할 때 앱 규칙을 맞출 것.
 */
export const GET: RequestHandler = async ({ request, url }) => {
  guard(request);
  const kind = (url.searchParams.get("kind") ?? "table") as "table" | "queue";
  const key = url.searchParams.get("key");
  const docs = mem.__docs(kind);
  if (key) return json(docs.get(key)?.doc ?? null);
  return json([...docs.keys()]);
};
