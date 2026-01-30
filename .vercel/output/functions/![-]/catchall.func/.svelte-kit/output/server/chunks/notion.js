import { b as private_env } from "./shared-server.js";
import { N as NOTION_PROPS } from "./constants.js";
const cache = /* @__PURE__ */ new Map();
async function withCache(key, ttlMs, fetcher, options) {
  const now = Date.now();
  const entry = cache.get(key);
  if (!options?.skipCache && entry && entry.expiry > now) {
    return entry.data;
  }
  const data = await fetcher();
  cache.set(key, {
    data,
    expiry: now + ttlMs
  });
  return data;
}
function invalidateCache(key) {
  cache.delete(key);
}
const NOTION_VERSION = "2022-06-28";
function getHeaders() {
  if (!private_env.NOTION_API_KEY) {
    console.error(">>> [Notion Service] FATAL: NOTION_API_KEY is missing.");
    throw new Error("NOTION_API_KEY is missing");
  }
  return {
    "Authorization": `Bearer ${private_env.NOTION_API_KEY}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json"
  };
}
async function notionQuery(databaseId, options = {}) {
  console.log(`>>> [Notion Service] notionQuery START [DB: ${databaseId}]`);
  let allResults = [];
  let hasMore = true;
  let nextCursor = void 0;
  try {
    while (hasMore) {
      const fetchRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          start_cursor: nextCursor,
          ...options
        })
      });
      const data = await fetchRes.json();
      if (!fetchRes.ok) {
        console.error(`>>> [Notion Service] Query Failed:`, data);
        throw new Error(data.message || "Notion API Query Error");
      }
      const fullPages = (data.results || []).filter((page) => page && "properties" in page);
      allResults = [...allResults, ...fullPages];
      hasMore = data.has_more;
      nextCursor = data.next_cursor ?? void 0;
    }
    console.log(`>>> [Notion Service] Query success. Count: ${allResults.length}`);
    return allResults;
  } catch (error) {
    console.error(`>>> [Notion Service] Error in notionQuery:`, error);
    throw error;
  }
}
const queryDatabase = notionQuery;
async function notionCreate(databaseId, properties) {
  console.log(`>>> [Notion Service] notionCreate START [DB: ${databaseId}]`);
  try {
    const response = await fetch(`https://api.notion.com/v1/pages`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error(`>>> [Notion Service] Create Failed:`, data);
      throw new Error(data.message || "Notion API Create Error");
    }
    console.log(`>>> [Notion Service] Create success: ${data.id}`);
    return data;
  } catch (error) {
    console.error(`>>> [Notion Service] Error in notionCreate:`, error);
    throw error;
  }
}
async function notionUpdate(pageId, properties) {
  console.log(`>>> [Notion Service] notionUpdate START [Page: ${pageId}]`);
  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ properties })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error(`>>> [Notion Service] Update Failed:`, data);
      throw new Error(data.message || "Notion API Update Error");
    }
    console.log(">>> [Notion Service] Update success");
    return data;
  } catch (error) {
    console.error(`>>> [Notion Service] Error in notionUpdate:`, error);
    throw error;
  }
}
async function notionArchive(pageId) {
  console.log(`>>> [Notion Service] notionArchive START [Page: ${pageId}]`);
  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify({ archived: true })
    });
    if (!response.ok) {
      const data = await response.json();
      console.error(`>>> [Notion Service] Archive Failed:`, data);
      throw new Error(data.message || "Notion API Archive Error");
    }
    console.log(">>> [Notion Service] Archive success");
  } catch (error) {
    console.error(`>>> [Notion Service] Error in notionArchive:`, error);
    throw error;
  }
}
async function notionRetrieve(pageId) {
  console.log(`>>> [Notion Service] notionRetrieve START [Page: ${pageId}]`);
  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "GET",
      headers: getHeaders()
    });
    const data = await response.json();
    if (!response.ok) {
      console.error(`>>> [Notion Service] Retrieve Failed:`, data);
      throw new Error(data.message || "Notion API Retrieve Error");
    }
    console.log(">>> [Notion Service] Retrieve success");
    return data;
  } catch (error) {
    console.error(`>>> [Notion Service] Error in notionRetrieve:`, error);
    throw error;
  }
}
async function notionRetrieveDatabase(databaseId) {
  console.log(`>>> [Notion Service] notionRetrieveDatabase START [DB: ${databaseId}]`);
  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      method: "GET",
      headers: getHeaders()
    });
    const data = await response.json();
    if (!response.ok) {
      console.error(`>>> [Notion Service] Retrieve DB Failed:`, data);
      throw new Error(data.message || "Notion API Retrieve DB Error");
    }
    console.log(">>> [Notion Service] Retrieve DB success");
    return data;
  } catch (error) {
    console.error(`>>> [Notion Service] Error in notionRetrieveDatabase:`, error);
    throw error;
  }
}
function getPropertyValue(property) {
  if (!property) return "";
  try {
    switch (property.type) {
      case "title":
        return (property.title || []).map((t) => t.plain_text).join("");
      case "rich_text":
        return (property.rich_text || []).map((t) => t.plain_text).join("");
      case "number":
        return property.number ?? 0;
      case "select":
        return property.select?.name ?? "";
      case "multi_select":
        return (property.multi_select || []).map((s) => s.name).join(", ");
      case "date":
        return property.date?.start ?? "";
      case "checkbox":
        return property.checkbox ?? false;
      case "email":
        return property.email ?? "";
      case "phone_number":
        return property.phone_number ?? "";
      case "url":
        return property.url ?? "";
      case "status":
        return property.status?.name ?? "";
      case "relation":
        return (property.relation || []).map((r) => r.id);
      case "people":
        return (property.people || []).map((p) => p.name || p.id);
      default:
        return "";
    }
  } catch (e) {
    console.log(">>> [Notion Service] Parsing Error:", e);
    return "";
  }
}
async function createMember(data) {
  const privateDbId = private_env.NOTION_DB_PRIVATE_INFO;
  const memberDbId = private_env.NOTION_DB_MEMBERS;
  if (!privateDbId || !memberDbId) throw new Error("DB IDs missing");
  const privatePage = await notionCreate(privateDbId, {
    [NOTION_PROPS.NAME]: { title: [{ text: { content: data.name } }] },
    [NOTION_PROPS.EMAIL]: { email: data.email },
    [NOTION_PROPS.PHONE]: { phone_number: data.phone },
    [NOTION_PROPS.BACKGROUND]: { rich_text: [{ text: { content: data.background } }] }
  });
  await notionCreate(memberDbId, {
    [NOTION_PROPS.NAME]: { title: [{ text: { content: data.name } }] },
    [NOTION_PROPS.DEPT]: { rich_text: [{ text: { content: data.department } }] },
    [NOTION_PROPS.MEMBER_TO_PRIVATE]: { relation: [{ id: privatePage.id }] },
    [NOTION_PROPS.JOIN_DATE]: { date: { start: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(/* @__PURE__ */ new Date()) } }
  });
}
async function getMemberByEmail(email, skipCache = false) {
  return withCache(`member_${email}`, 3e5, async () => {
    const dbId = private_env.NOTION_DB_PRIVATE_INFO;
    if (!dbId) throw new Error("NOTION_DB_PRIVATE_INFO missing");
    const results = await notionQuery(dbId, {
      filter: { property: NOTION_PROPS.EMAIL, email: { equals: email } }
    });
    if (results.length === 0) return null;
    const page = results[0];
    const relationProp = page.properties[NOTION_PROPS.PRIVATE_TO_MEMBER];
    if (!relationProp || relationProp.type !== "relation" || !relationProp.relation?.length) {
      return null;
    }
    return {
      privateInfoId: page.id,
      memberId: relationProp.relation[0].id
    };
  }, { skipCache });
}
async function getMemberById(memberId) {
  const page = await notionRetrieve(memberId);
  return {
    id: page.id,
    name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
    privateInfoId: page.properties[NOTION_PROPS.MEMBER_TO_PRIVATE]?.relation?.[0]?.id
  };
}
async function getAllMembers(skipCache = false) {
  return withCache("all_members", 6e4, async () => {
    const dbId = private_env.NOTION_DB_MEMBERS;
    if (!dbId) throw new Error("NOTION_DB_MEMBERS missing");
    const results = await notionQuery(dbId, {
      filter: { property: NOTION_PROPS.NAME, title: { is_not_empty: true } },
      sorts: [{ property: NOTION_PROPS.NAME, direction: "ascending" }]
    });
    return results.map((page) => ({
      id: page.id,
      name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
      department: getPropertyValue(page.properties[NOTION_PROPS.DEPT]),
      joinDate: getPropertyValue(page.properties[NOTION_PROPS.JOIN_DATE])
    }));
  });
}
async function getActivities(startDate, endDate, skipCache = false) {
  return withCache(`activities_${startDate}_${endDate}`, 3e5, async () => {
    const dbId = private_env.NOTION_DB_ACTIVITIES;
    if (!dbId) throw new Error("NOTION_DB_ACTIVITIES missing");
    const results = await notionQuery(dbId, {
      filter: {
        and: [
          { property: NOTION_PROPS.ACTIVITY_DATE, date: { on_or_after: startDate } },
          { property: NOTION_PROPS.ACTIVITY_DATE, date: { on_or_before: endDate } }
        ]
      },
      sorts: [{ property: NOTION_PROPS.ACTIVITY_DATE, direction: "descending" }]
    });
    return results.map((page) => ({
      id: page.id,
      name: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_NAME]),
      date: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_DATE]),
      type: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_TYPE]),
      attendees: getPropertyValue(page.properties[NOTION_PROPS.ATTENDANCE]),
      url: page.public_url || page.url
    }));
  });
}
async function getAllActivities() {
  return withCache("all_activities", 6e4, async () => {
    const dbId = private_env.NOTION_DB_ACTIVITIES;
    if (!dbId) throw new Error("NOTION_DB_ACTIVITIES missing");
    const results = await notionQuery(dbId, {
      sorts: [{ property: NOTION_PROPS.ACTIVITY_DATE, direction: "descending" }]
    });
    return results.map((page) => ({
      id: page.id,
      name: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_NAME]),
      date: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_DATE]),
      type: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_TYPE]),
      url: page.public_url || page.url
    }));
  });
}
async function getUserActivities(memberId) {
  return withCache(`user_activities_${memberId}`, 3e5, async () => {
    const dbId = private_env.NOTION_DB_ACTIVITIES;
    if (!dbId) throw new Error("NOTION_DB_ACTIVITIES missing");
    const results = await notionQuery(dbId, {
      filter: { property: NOTION_PROPS.ATTENDANCE, relation: { contains: memberId } },
      sorts: [{ property: NOTION_PROPS.ACTIVITY_DATE, direction: "descending" }]
    });
    return results.map((page) => ({
      id: page.id,
      name: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_NAME]),
      date: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_DATE]),
      type: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_TYPE]),
      url: page.public_url || page.url
    }));
  });
}
async function getUserSeminars(memberId) {
  const dbId = private_env.NOTION_DB_SEMINARS;
  if (!dbId) return [];
  const results = await notionQuery(dbId, {
    filter: { property: NOTION_PROPS.SEMINAR_SPEAKER, relation: { contains: memberId } },
    sorts: [{ property: NOTION_PROPS.SEMINAR_SEMESTER, direction: "descending" }]
  });
  return results.map((page) => ({
    id: page.id,
    title: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_TITLE]),
    remarks: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REMARKS]),
    semester: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_SEMESTER])
  }));
}
async function getApplicationsFromNotion() {
  const dbId = private_env.NOTION_DB_APPLICATIONS;
  if (!dbId) return [];
  const results = await notionQuery(dbId);
  return results.map((page) => ({
    id: page.id,
    email: getPropertyValue(page.properties[NOTION_PROPS.EMAIL]),
    name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
    phone: getPropertyValue(page.properties[NOTION_PROPS.PHONE_APP]),
    department: getPropertyValue(page.properties[NOTION_PROPS.DEPT]),
    background: getPropertyValue(page.properties[NOTION_PROPS.BACKGROUND]),
    accepted: getPropertyValue(page.properties[NOTION_PROPS.APP_ACCEPTED]),
    submittedAt: page.created_time
  }));
}
async function markApplicationAsAccepted(id) {
  const propertyName = NOTION_PROPS.APP_ACCEPTED.normalize("NFC");
  await notionUpdate(id, { [propertyName]: { checkbox: true } });
}
async function updateApplicationInNotion(id, data) {
  await notionUpdate(id, {
    [NOTION_PROPS.NAME]: { title: [{ text: { content: data.name } }] },
    [NOTION_PROPS.PHONE_APP]: { phone_number: data.phone },
    [NOTION_PROPS.DEPT]: { rich_text: [{ text: { content: data.department } }] },
    [NOTION_PROPS.BACKGROUND]: { rich_text: [{ text: { content: data.background } }] }
  });
}
async function createApplicationInNotion(data) {
  const dbId = private_env.NOTION_DB_APPLICATIONS;
  if (!dbId) return null;
  const page = await notionCreate(dbId, {
    [NOTION_PROPS.NAME]: { title: [{ text: { content: data.name } }] },
    [NOTION_PROPS.EMAIL]: { email: data.email },
    [NOTION_PROPS.PHONE_APP]: { phone_number: data.phone },
    [NOTION_PROPS.DEPT]: { rich_text: [{ text: { content: data.department } }] },
    [NOTION_PROPS.BACKGROUND]: { rich_text: [{ text: { content: data.background } }] }
  });
  return page.id;
}
async function removeApplicationInNotion(id) {
  await notionArchive(id);
}
async function getSeminarRequestsFromNotion() {
  const dbId = private_env.NOTION_DB_SEMINAR_REQUESTS;
  if (!dbId) return [];
  const results = await notionQuery(dbId);
  return results.map((page) => ({
    id: page.id,
    title: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REQ_TITLE]),
    description: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REQ_DESC]),
    prerequisites: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REQ_PREREQ]),
    duration: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REQ_DURATION]),
    speakerIds: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REQ_SPEAKERS]),
    status: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REQ_APPROVED]) ? "approved" : "pending",
    submittedAt: page.created_time
  }));
}
async function createSeminarRequestInNotion(data) {
  const dbId = private_env.NOTION_DB_SEMINAR_REQUESTS;
  if (!dbId) return null;
  const page = await notionCreate(dbId, {
    [NOTION_PROPS.SEMINAR_REQ_TITLE]: { title: [{ text: { content: data.title } }] },
    [NOTION_PROPS.SEMINAR_REQ_DESC]: { rich_text: [{ text: { content: data.description } }] },
    [NOTION_PROPS.SEMINAR_REQ_PREREQ]: { rich_text: [{ text: { content: data.prerequisites } }] },
    [NOTION_PROPS.SEMINAR_REQ_DURATION]: { rich_text: [{ text: { content: data.duration } }] },
    [NOTION_PROPS.SEMINAR_REQ_SPEAKERS]: { relation: (data.speakerIds || []).map((id) => ({ id })) }
  });
  return page.id;
}
async function updateSeminarRequestStatusInNotion(id, status) {
  await notionUpdate(id, { [NOTION_PROPS.SEMINAR_REQ_APPROVED]: { checkbox: status === "approved" } });
}
const removeSeminarRequestInNotion = notionArchive;
async function createActivityPage(data) {
  const dbId = private_env.NOTION_DB_ACTIVITIES;
  if (!dbId) throw new Error("NOTION_DB_ACTIVITIES missing");
  const dateObj = { start: data.date };
  if (data.timeZone) dateObj.time_zone = data.timeZone;
  const properties = {
    [NOTION_PROPS.ACTIVITY_NAME]: { title: [{ text: { content: data.title } }] },
    [NOTION_PROPS.ACTIVITY_DATE]: { date: dateObj },
    [NOTION_PROPS.ACTIVITY_TYPE]: { select: { name: data.type } }
  };
  if (data.attendeeIds && data.attendeeIds.length > 0) {
    properties[NOTION_PROPS.ATTENDANCE] = { relation: data.attendeeIds.map((id) => ({ id })) };
  }
  return await notionCreate(dbId, properties);
}
async function updatePrivateInfo(pageId, data) {
  const props = {};
  if (data.phone !== void 0) props[NOTION_PROPS.PHONE] = { phone_number: data.phone };
  if (data.background !== void 0) props[NOTION_PROPS.BACKGROUND] = { rich_text: [{ text: { content: data.background } }] };
  await notionUpdate(pageId, props);
}
async function updateSeminar(pageId, data) {
  const props = {};
  if (data.title !== void 0) props[NOTION_PROPS.SEMINAR_TITLE] = { title: [{ text: { content: data.title } }] };
  if (data.remarks !== void 0) props[NOTION_PROPS.SEMINAR_REMARKS] = { rich_text: [{ text: { content: data.remarks } }] };
  await notionUpdate(pageId, props);
}
async function getPrivateInfo(pageId) {
  const page = await notionRetrieve(pageId);
  return {
    email: getPropertyValue(page.properties[NOTION_PROPS.EMAIL]),
    name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
    phone: getPropertyValue(page.properties[NOTION_PROPS.PHONE]),
    background: getPropertyValue(page.properties[NOTION_PROPS.BACKGROUND])
  };
}
async function getAllPrivateInfo() {
  const dbId = private_env.NOTION_DB_PRIVATE_INFO;
  if (!dbId) throw new Error("NOTION_DB_PRIVATE_INFO missing");
  const results = await notionQuery(dbId);
  return results.map((page) => ({
    id: page.id,
    name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
    email: getPropertyValue(page.properties[NOTION_PROPS.EMAIL]),
    memberId: page.properties[NOTION_PROPS.PRIVATE_TO_MEMBER]?.relation?.[0]?.id
  }));
}
async function getPresidentName(semesterPrefix) {
  return withCache(`president_${semesterPrefix}`, 36e5, async () => {
    const dbId = private_env.NOTION_DB_MEMBERS;
    if (!dbId) return "";
    const results = await notionQuery(dbId, {
      filter: {
        or: [
          { property: NOTION_PROPS.EXECUTIVES, multi_select: { contains: `${semesterPrefix} 회장` } },
          { property: NOTION_PROPS.EXECUTIVES, multi_select: { contains: `${semesterPrefix} 회 장` } }
        ]
      }
    });
    if (results.length === 0) return "";
    return getPropertyValue(results[0].properties[NOTION_PROPS.NAME]);
  });
}
async function getDatabaseSchema(databaseId) {
  return withCache(`schema_${databaseId}`, 36e5, async () => {
    const response = await notionRetrieveDatabase(databaseId);
    const result = {};
    if (response && response.properties) {
      for (const [key, value] of Object.entries(response.properties)) {
        const type = value.type;
        const options = value[type]?.options?.map((o) => o.name);
        result[key] = { type, options };
      }
    }
    return result;
  });
}
async function addAttendeeToActivity(pageId, memberId) {
  const page = await notionRetrieve(pageId);
  const currentIds = getPropertyValue(page.properties[NOTION_PROPS.ATTENDANCE]) || [];
  if (currentIds.includes(memberId)) return;
  const newIds = [...currentIds, memberId].map((id) => ({ id }));
  await notionUpdate(pageId, { [NOTION_PROPS.ATTENDANCE]: { relation: newIds } });
}
async function checkPageExists(pageId) {
  try {
    const page = await notionRetrieve(pageId);
    return !!page && !page.archived;
  } catch {
    return false;
  }
}
async function getAttendanceQueueFromNotion() {
  const dbId = private_env.NOTION_DB_ATTENDANCE_QUEUE;
  if (!dbId) return [];
  const results = await notionQuery(dbId);
  return results.map((page) => ({
    id: page.id,
    eventId: getPropertyValue(page.properties.EventId),
    userEmail: getPropertyValue(page.properties.UserEmail),
    userName: getPropertyValue(page.properties.UserName),
    userDept: getPropertyValue(page.properties.UserDept),
    startTime: getPropertyValue(page.properties.StartTime),
    endTime: getPropertyValue(page.properties.EndTime),
    status: getPropertyValue(page.properties.Status) || "pending"
  }));
}
async function createAttendanceRecordInNotion(data) {
  const dbId = private_env.NOTION_DB_ATTENDANCE_QUEUE;
  if (!dbId) return null;
  const page = await notionCreate(dbId, {
    UserName: { title: [{ text: { content: data.userName } }] },
    UserEmail: { email: data.userEmail },
    UserDept: { rich_text: [{ text: { content: data.userDept } }] },
    EventId: { rich_text: [{ text: { content: data.eventId } }] },
    StartTime: { date: { start: data.startTime } },
    Status: { select: { name: "pending" } }
  });
  return page.id;
}
async function updateAttendanceRecordInNotion(id, updates) {
  const props = {};
  if (updates.endTime) props.EndTime = { date: { start: updates.endTime } };
  if (updates.startTime) props.StartTime = { date: { start: updates.startTime } };
  if (updates.status) props.Status = { select: { name: updates.status } };
  await notionUpdate(id, props);
}
async function removeAttendanceRecordInNotion(id) {
  await notionArchive(id);
}
async function getEventsFromNotion() {
  const dbId = private_env.NOTION_DB_EVENTS;
  if (!dbId) return [];
  const results = await notionQuery(dbId);
  return results.map((page) => ({
    id: page.id,
    title: getPropertyValue(page.properties[NOTION_PROPS.EVENT_TITLE]),
    date: getPropertyValue(page.properties[NOTION_PROPS.EVENT_DATE]),
    type: getPropertyValue(page.properties[NOTION_PROPS.EVENT_TYPE]),
    status: getPropertyValue(page.properties[NOTION_PROPS.EVENT_STATUS]) || "draft",
    pathId: getPropertyValue(page.properties[NOTION_PROPS.EVENT_PATH_ID]),
    attendCode: getPropertyValue(page.properties[NOTION_PROPS.EVENT_ATTEND_CODE]),
    notionPageId: getPropertyValue(page.properties[NOTION_PROPS.EVENT_NOTION_PAGE_ID]),
    timeZone: getPropertyValue(page.properties[NOTION_PROPS.EVENT_TIME_ZONE])
  }));
}
async function createEventInNotion(data) {
  const dbId = private_env.NOTION_DB_EVENTS;
  if (!dbId) return null;
  const props = {
    [NOTION_PROPS.EVENT_TITLE]: { title: [{ text: { content: data.title } }] },
    [NOTION_PROPS.EVENT_DATE]: { date: { start: data.date } },
    [NOTION_PROPS.EVENT_TYPE]: { select: { name: data.type } },
    [NOTION_PROPS.EVENT_STATUS]: { select: { name: data.status } },
    [NOTION_PROPS.EVENT_PATH_ID]: { rich_text: [{ text: { content: data.pathId } }] },
    [NOTION_PROPS.EVENT_ATTEND_CODE]: { rich_text: [{ text: { content: data.attendCode } }] }
  };
  if (data.notionPageId) {
    props[NOTION_PROPS.EVENT_NOTION_PAGE_ID] = { rich_text: [{ text: { content: data.notionPageId } }] };
  }
  if (data.timeZone) {
    props[NOTION_PROPS.EVENT_TIME_ZONE] = { rich_text: [{ text: { content: data.timeZone } }] };
  }
  const page = await notionCreate(dbId, props);
  return page.id;
}
async function updateEventStatusInNotion(id, status, notionPageId) {
  const props = {
    [NOTION_PROPS.EVENT_STATUS]: { select: { name: status } }
  };
  if (notionPageId) {
    props[NOTION_PROPS.EVENT_NOTION_PAGE_ID] = { rich_text: [{ text: { content: notionPageId } }] };
  }
  await notionUpdate(id, props);
}
async function deleteEventInNotion(id) {
  await notionArchive(id);
}
const notion = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  addAttendeeToActivity,
  checkPageExists,
  createActivityPage,
  createApplicationInNotion,
  createAttendanceRecordInNotion,
  createEventInNotion,
  createMember,
  createSeminarRequestInNotion,
  deleteEventInNotion,
  getActivities,
  getAllActivities,
  getAllMembers,
  getAllPrivateInfo,
  getApplicationsFromNotion,
  getAttendanceQueueFromNotion,
  getDatabaseSchema,
  getEventsFromNotion,
  getMemberByEmail,
  getMemberById,
  getPresidentName,
  getPrivateInfo,
  getPropertyValue,
  getSeminarRequestsFromNotion,
  getUserActivities,
  getUserSeminars,
  markApplicationAsAccepted,
  notionArchive,
  notionCreate,
  notionQuery,
  notionRetrieve,
  notionRetrieveDatabase,
  notionUpdate,
  queryDatabase,
  removeApplicationInNotion,
  removeAttendanceRecordInNotion,
  removeSeminarRequestInNotion,
  updateApplicationInNotion,
  updateAttendanceRecordInNotion,
  updateEventStatusInNotion,
  updatePrivateInfo,
  updateSeminar,
  updateSeminarRequestStatusInNotion
}, Symbol.toStringTag, { value: "Module" }));
export {
  queryDatabase as A,
  getPropertyValue as B,
  getAllPrivateInfo as C,
  getSeminarRequestsFromNotion as D,
  removeSeminarRequestInNotion as E,
  updateSeminarRequestStatusInNotion as F,
  createSeminarRequestInNotion as G,
  getApplicationsFromNotion as H,
  removeApplicationInNotion as I,
  createApplicationInNotion as J,
  notion as K,
  getPresidentName as a,
  getMemberByEmail as b,
  updatePrivateInfo as c,
  getActivities as d,
  getUserActivities as e,
  getPrivateInfo as f,
  getAllMembers as g,
  getUserSeminars as h,
  createActivityPage as i,
  addAttendeeToActivity as j,
  invalidateCache as k,
  createMember as l,
  markApplicationAsAccepted as m,
  getAllActivities as n,
  getDatabaseSchema as o,
  checkPageExists as p,
  updateEventStatusInNotion as q,
  createEventInNotion as r,
  removeAttendanceRecordInNotion as s,
  updateAttendanceRecordInNotion as t,
  updateSeminar as u,
  deleteEventInNotion as v,
  getAttendanceQueueFromNotion as w,
  withCache as x,
  createAttendanceRecordInNotion as y,
  getEventsFromNotion as z
};
