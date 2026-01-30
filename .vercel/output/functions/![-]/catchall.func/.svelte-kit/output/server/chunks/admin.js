import { b as private_env } from "./shared-server.js";
import { H as getApplicationsFromNotion, I as removeApplicationInNotion, J as createApplicationInNotion } from "./notion.js";
async function getApplications() {
  try {
    return await getApplicationsFromNotion();
  } catch (e) {
    console.error("Failed to fetch applications from Notion:", e);
    return [];
  }
}
async function addApplication(app) {
  try {
    const id = await createApplicationInNotion(app);
    return { ...app, id, submittedAt: (/* @__PURE__ */ new Date()).toISOString(), accepted: false };
  } catch (e) {
    console.error("Failed to create application in Notion:", e);
    throw e;
  }
}
async function updateApplication(id, app) {
  try {
    const { updateApplicationInNotion } = await import("./notion.js").then((n) => n.K);
    await updateApplicationInNotion(id, app);
  } catch (e) {
    console.error("Failed to update application in Notion:", e);
    throw e;
  }
}
async function removeApplication(id) {
  try {
    await removeApplicationInNotion(id);
  } catch (e) {
    console.error("Failed to remove application from Notion:", e);
  }
}
function isAdmin(email) {
  if (!email) return false;
  const admins = (private_env.ADMINS_EMAILS || "").split(",").map((e) => e.trim());
  return admins.includes(email);
}
export {
  addApplication,
  getApplications,
  isAdmin,
  removeApplication,
  updateApplication
};
