/** Display facts from the existing public payload; never derive a missing time. */
export function publicSeminarSchedule(value: string | null, timeKnown = false) {
  if (!value)
    return { text: "일정 기록 없음", dateTime: null, timeKnown: false };
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    return { text: "일정 기록 확인 필요", dateTime: null, timeKnown: false };
  const text = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    ...(timeKnown ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
  return { text, dateTime: timeKnown ? value : null, timeKnown };
}

export function publicSeminarFiles(urls: string[]) {
  return urls.map((url, index) => {
    const raw = url.split("/").pop() ?? "";
    let name = raw;
    try {
      name = decodeURIComponent(raw);
    } catch {
      // Display a recorded filename safely; do not rewrite its source URL.
    }
    const extension = name.includes(".")
      ? (name.split(".").pop() ?? "").toLowerCase()
      : "";
    const kind =
      extension === "pdf"
        ? "PDF"
        : ["png", "jpg", "jpeg", "gif", "webp", "avif"].includes(extension)
          ? "이미지"
          : "자료";
    return {
      key: index,
      name: name || "자료 연결 확인 필요",
      href: url || null,
      kind,
    };
  });
}
