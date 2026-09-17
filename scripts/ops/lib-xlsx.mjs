/**
 * 최소 XLSX 작성기 — 의존성 없이 진짜 `.xlsx`(OOXML)를 만든다.
 *
 * 왜 직접 쓰나: 이 저장소에는 엑셀 라이브러리가 없고, 명부 한 장을 뽑자고
 * 운영 의존성을 늘리고 싶지 않다. XLSX는 XML 몇 장을 담은 ZIP이고, 문자열을
 * 셀 안에 그대로 넣으면(`inlineStr`) 공유 문자열 테이블도 필요 없다.
 *
 * 모든 셀은 **문자열**로 쓴다. 전화번호(`010-…`)와 학번(`2024-12345`)을 숫자로
 * 넘기면 엑셀이 앞의 0을 지우거나 날짜로 바꿔 버린다 — 명부에서 그것은 파손이다.
 *
 * 압축은 하지 않는다(STORE). 명부 한 장은 작고, 압축을 빼면 만들어진 파일이
 * 스펙대로인지 눈으로 확인하기 쉽다.
 */
import { deflateRawSync } from "node:zlib";

void deflateRawSync; // STORE만 쓰지만, 압축으로 바꿀 자리를 남겨 둔다.

/** ZIP용 CRC-32. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

/** @param {Buffer} buf */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** XML 텍스트 이스케이프 — 이름에 `&`나 `<`가 들어와도 파일이 깨지지 않게. */
function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 0-기반 열 번호 → 엑셀 열 이름(A, B, …, AA). */
function columnName(index) {
  let name = "";
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/**
 * @param {string[][]} rows 첫 행이 머리글
 * @param {string} sheetName
 */
function sheetXml(rows, sheetName) {
  void sheetName;
  const body = rows
    .map((row, r) => {
      const cells = row
        .map(
          (value, c) =>
            `<c r="${columnName(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`,
        )
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

const workbookXml = (
  sheetName,
) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

/**
 * 파일 목록을 ZIP(STORE)으로 묶는다.
 * @param {{name: string, data: Buffer}[]} files
 */
function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data);
    const size = file.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // 로컬 헤더 서명
    local.writeUInt16LE(20, 4); // 필요 버전
    local.writeUInt16LE(0x0800, 6); // UTF-8 파일명 플래그
    local.writeUInt16LE(0, 8); // 압축 없음(STORE)
    local.writeUInt16LE(0, 10); // 시각
    local.writeUInt16LE(0x21, 12); // 날짜(1980-01-01) — 재실행해도 같은 파일이 나온다
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, file.data);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); // 중앙 디렉터리 서명
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(0, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0x21, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(size, 20);
    dir.writeUInt32LE(size, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42); // 로컬 헤더 위치
    central.push(Buffer.concat([dir, nameBuf]));

    offset += local.length + nameBuf.length + size;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuf, end]);
}

/**
 * 표 한 장짜리 `.xlsx` 바이트를 만든다.
 * @param {string[][]} rows 첫 행이 머리글
 * @param {string} [sheetName]
 * @returns {Buffer}
 */
export function buildXlsx(rows, sheetName = "Sheet1") {
  const utf8 = (s) => Buffer.from(s, "utf8");
  return zip([
    { name: "[Content_Types].xml", data: utf8(CONTENT_TYPES) },
    { name: "_rels/.rels", data: utf8(ROOT_RELS) },
    { name: "xl/workbook.xml", data: utf8(workbookXml(sheetName)) },
    { name: "xl/_rels/workbook.xml.rels", data: utf8(WORKBOOK_RELS) },
    { name: "xl/worksheets/sheet1.xml", data: utf8(sheetXml(rows, sheetName)) },
  ]);
}
