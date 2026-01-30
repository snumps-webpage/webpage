import { D as getSeminarRequestsFromNotion, E as removeSeminarRequestInNotion, F as updateSeminarRequestStatusInNotion, G as createSeminarRequestInNotion } from "./notion.js";
async function getSeminarRequests() {
  try {
    const results = await getSeminarRequestsFromNotion();
    return results;
  } catch (e) {
    console.error("Failed to fetch seminar requests from Notion:", e);
    return [];
  }
}
async function deleteSeminarRequest(id) {
  try {
    await removeSeminarRequestInNotion(id);
  } catch (e) {
    console.error("Failed to delete seminar request from Notion:", e);
    throw e;
  }
}
async function createSeminarRequest(data) {
  try {
    const id = await createSeminarRequestInNotion({
      ...data
    });
    if (!id) throw new Error("Notion creation returned no ID");
    return {
      ...data,
      id,
      status: "pending",
      submittedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (e) {
    console.error("Notion seminar request write failed:", e);
    throw e;
  }
}
async function updateSeminarRequestStatus(id, status) {
  try {
    await updateSeminarRequestStatusInNotion(id, status);
    return { id, status };
  } catch (e) {
    console.error("Failed to update seminar request in Notion:", e);
    throw e;
  }
}
export {
  createSeminarRequest as c,
  deleteSeminarRequest as d,
  getSeminarRequests as g,
  updateSeminarRequestStatus as u
};
