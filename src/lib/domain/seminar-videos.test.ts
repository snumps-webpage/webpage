import { describe, expect, it } from "vitest";
import { parseSeminarVideosForm, SEMINAR_VIDEO_LIMITS } from "./seminar-videos";

function form(rows: [url: string, title: string][]) {
  const fd = new FormData();
  for (const [url, title] of rows) {
    fd.append("videoUrl", url);
    fd.append("videoTitle", title);
  }
  return fd;
}

const YT = "https://www.youtube.com/watch?v=abc";

describe("parseSeminarVideosForm", () => {
  it("pairs each url with its title, in order", () => {
    expect(
      parseSeminarVideosForm(
        form([
          [YT, "1부 녹화"],
          ["https://youtu.be/xyz", ""],
        ]),
      ),
    ).toEqual({
      success: true,
      data: [
        { url: YT, title: "1부 녹화" },
        { url: "https://youtu.be/xyz", title: "" },
      ],
    });
  });

  it("drops rows left blank — an empty editor row is not a video", () => {
    expect(
      parseSeminarVideosForm(
        form([
          ["  ", ""],
          [YT, ""],
        ]),
      ),
    ).toEqual({
      success: true,
      data: [{ url: YT, title: "" }],
    });
  });

  it("strips invisible characters and trims", () => {
    expect(
      parseSeminarVideosForm(form([[` ${YT}\u200B `, " 녹화\u200B "]])),
    ).toEqual({ success: true, data: [{ url: YT, title: "녹화" }] });
  });

  it.each([
    ["http (not https)", "http://www.youtube.com/watch?v=abc", ""],
    ["not a url", "youtube 영상", ""],
    ["title without url", "", "제목만"],
    ["url too long", `https://e.com/${"a".repeat(2048)}`, ""],
    ["title too long", YT, "가".repeat(SEMINAR_VIDEO_LIMITS.title + 1)],
  ])("refuses %s", (_label, url, title) => {
    const result = parseSeminarVideosForm(form([[url, title]]));
    expect(result.success).toBe(false);
  });

  it("refuses more videos than the limit", () => {
    const rows = Array.from(
      { length: SEMINAR_VIDEO_LIMITS.count + 1 },
      (_, i): [string, string] => [`${YT}${i}`, ""],
    );
    expect(parseSeminarVideosForm(form(rows)).success).toBe(false);
  });

  it("accepts exactly the limits", () => {
    const rows = Array.from(
      { length: SEMINAR_VIDEO_LIMITS.count },
      (_, i): [string, string] => [
        `${YT}${i}`,
        "가".repeat(SEMINAR_VIDEO_LIMITS.title),
      ],
    );
    expect(parseSeminarVideosForm(form(rows)).success).toBe(true);
  });

  it("reads no rows as an empty list", () => {
    expect(parseSeminarVideosForm(new FormData())).toEqual({
      success: true,
      data: [],
    });
  });
});
