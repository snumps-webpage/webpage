import {
  fail,
  redirect,
  isActionFailure,
  type ActionFailure,
} from "@sveltejs/kit";
import { ensureSession, handleUserAction } from "$lib/server/auth-guards";
import {
  getApplicationForEmail,
  updateOwnApplication,
} from "$lib/server/services/membership";
import { applicationView } from "$lib/server/data/views";
import { parseGoogleName } from "$lib/utils";
import { AppError } from "$lib/server/core/errors";
import { stripInvisibles } from "$lib/server/core/strings";
import { formText, fieldIssues } from "$lib/domain/form-data";
import { membershipApplicationUpdateSchema } from "$lib/domain/membership-applications";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const session = await ensureSession(event.locals, event.url);

  const application = await getApplicationForEmail(session.user.email);
  if (!application) throw redirect(302, "/signup");

  return {
    user: session.user,
    parsedInfo: parseGoogleName(session.user.name),
    // The projection, never the raw row: this key replaces the layout's (LA36-1).
    application: applicationView(application),
  };
};

export const actions = {
  default: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    const retainedValues = {
      phone: formText(data, "phone"),
      studentId: stripInvisibles(formText(data, "studentId")),
      background: formText(data, "background"),
    };
    const result = await handleUserAction(locals, async (session) => {
      const { name, department } = parseGoogleName(session.user.name);
      if (!name || !department) {
        throw new AppError("VALIDATION_FAILED", {
          userMessage: "계정 정보에서 이름 또는 학과를 찾을 수 없습니다.",
        });
      }

      const values = {
        phone: formText(data, "phone"),
        studentId: stripInvisibles(formText(data, "studentId")),
        background: formText(data, "background"),
      };
      const parsed = membershipApplicationUpdateSchema.safeParse(values);
      if (!parsed.success) {
        return fail(400, {
          error: "VALIDATION_FAILED",
          issues: fieldIssues(parsed.error),
          values,
        });
      }

      // Own row only — resolved by session email, never by a client-supplied id.
      await updateOwnApplication(session.user.email, {
        name,
        department,
        ...parsed.data,
      });
      return { operation: "applicationUpdated" as const };
    });
    if (isActionFailure(result as unknown)) {
      const failure = result as unknown as ActionFailure<
        Record<string, unknown>
      >;
      return fail(failure.status, {
        ...failure.data,
        operation: "applicationUpdated" as const,
        values: retainedValues,
      });
    }
    return result;
  },
};
