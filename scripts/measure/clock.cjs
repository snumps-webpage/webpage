// Time machine for the measurement server: Date is shifted by the millisecond
// offset stored in $FAKE_CLOCK_FILE (re-read at most every 200 ms).
// Loaded with `node --require`, which needs CommonJS — hence require().
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
const file = process.env.FAKE_CLOCK_FILE;
const RealDate = Date;
let offset = 0;
let lastRead = 0;
function currentOffset() {
  const now = RealDate.now();
  if (file && now - lastRead > 200) {
    lastRead = now;
    try {
      offset = Number(fs.readFileSync(file, "utf8").trim()) || 0;
    } catch {
      offset = 0;
    }
  }
  return offset;
}
class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + currentOffset());
    else super(...args);
  }
  static now() {
    return RealDate.now() + currentOffset();
  }
}
globalThis.Date = FakeDate;
