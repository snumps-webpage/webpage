import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { formText } from "$lib/domain/form-data";
import {
  createSeminarSeries,
  getSeminarSeries,
} from "$lib/server/services/seminar-series";
import type { PageServerLoad } from "./$types";
export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  return { series: await getSeminarSeries() };
};
type Ctx = { request: Request; locals: App.Locals };
export const actions = {
  create: async ({ request, locals }: Ctx) =>
    handleAdminAction(locals, async () => {
      const data = await request.formData();
      const series = await createSeminarSeries(locals.member!.memberId, {
        title: formText(data, "title"),
        description: formText(data, "description"),
      });
      return { operation: "created", seriesId: series.id };
    }),
};
