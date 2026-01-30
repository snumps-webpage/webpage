function getSemesterInfo(date) {
  if (!date) {
    const now = /* @__PURE__ */ new Date();
    const kstStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false
    }).format(now);
    date = new Date(kstStr);
  }
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month >= 3 && month <= 8) {
    return {
      name: `${year}년 1학기`,
      key: `${year % 100}-1`,
      startDate: `${year}-03-01`,
      endDate: `${year}-08-31`
    };
  } else if (month >= 9) {
    return {
      name: `${year}년 2학기`,
      key: `${year % 100}-2`,
      startDate: `${year}-09-01`,
      endDate: `${year + 1}-02-28`
    };
  } else {
    return {
      name: `${year - 1}년 2학기`,
      key: `${(year - 1) % 100}-2`,
      startDate: `${year - 1}-09-01`,
      endDate: `${year}-02-28`
    };
  }
}
function getSemesterKeyFromDate(dateStr) {
  if (!dateStr) return "Unknown";
  const parts = dateStr.split("T")[0].split("-");
  if (parts.length < 2) return "Unknown";
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  if (month >= 3 && month <= 8) return `${year % 100}-1`;
  if (month >= 9) return `${year % 100}-2`;
  return `${(year - 1) % 100}-2`;
}
function normalizePhoneNumber(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}
function getIsoStringWithOffset(dateStr, timeZone) {
  let guess = /* @__PURE__ */ new Date(dateStr + ":00Z");
  const getParts = (d, tz) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
      timeZoneName: "longOffset"
    }).formatToParts(d);
    const p = {};
    parts.forEach((x) => p[x.type] = x.value);
    return p;
  };
  for (let i = 0; i < 3; i++) {
    const parts = getParts(guess, timeZone);
    const year = parseInt(parts.year);
    const month = parseInt(parts.month);
    const day = parseInt(parts.day);
    let hour = parseInt(parts.hour);
    if (hour === 24) hour = 0;
    const minute = parseInt(parts.minute);
    const [y, m, d_str] = dateStr.split("T")[0].split("-").map(Number);
    const [h, min] = dateStr.split("T")[1].split(":").map(Number);
    const targetTs = Date.UTC(y, m - 1, d_str, h, min);
    const actualTs = Date.UTC(year, month - 1, day, hour, minute);
    const diff = targetTs - actualTs;
    if (diff === 0) {
      const offsetPart = parts.timeZoneName?.replace("GMT", "") || "+00:00";
      const iso = offsetPart === "GMT" ? "+00:00" : offsetPart;
      return dateStr + ":00" + iso;
    }
    guess = new Date(guess.getTime() + diff);
  }
  throw new Error(`Failed to calculate offset for ${dateStr} in ${timeZone}`);
}
export {
  getSemesterKeyFromDate as a,
  getIsoStringWithOffset as b,
  getSemesterInfo as g,
  normalizePhoneNumber as n
};
