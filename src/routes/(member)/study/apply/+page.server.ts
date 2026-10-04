import { fail, isActionFailure, type ActionFailure } from "@sveltejs/kit";
import { handleUserAction } from "$lib/server/auth-guards";
import { currentTerm } from "$lib/server/core/semester";
import {
  studyRequestValuesFromFormData,
  studyTargetIdSchema,
  validateStudyRequestForm,
} from "$lib/domain/studies";
import { formText } from "$lib/domain/form-data";
import { getTable } from "$lib/server/data/tables";
import { studyRequestView } from "$lib/server/data/views";
import { CAPABILITIES, hasCapability } from "$lib/server/core/capabilities";
import {
  submitStudyRequest,
  withdrawStudyRequest,
} from "$lib/server/services/studies";
import type { PageServerLoad } from "./$types";
import { sendStudyApplicationNotification } from "$lib/server/mail";

/** STU-01: study proposal — approval-gated (ADM-16). */
export const load: PageServerLoad = async ({ locals }) => {
  const memberId = locals.member!.memberId;
  const requests = await getTable("study-requests");
  return {
    defaultSemester: currentTerm(),
    canSubmit: hasCapability(
      locals.member?.capabilities,
      CAPABILITIES.PARTICIPATE,
    ),
    myRequests: requests
      .filter((r) => r.requesterId === memberId)
      .map(studyRequestView)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
  };
};

export const actions = {
  // Kit rejects a default action alongside a named withdrawal action.
  submit: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    const result = await handleUserAction(locals, async () => {
      const parsed = validateStudyRequestForm(data);
      if (!parsed.success) return fail(400, parsed.failure);
      const { title, textbook, description, semester } = parsed.data;
      const row = await submitStudyRequest({
        title,
        textbook,
        description,
        semester,
        requesterId: locals.member!.memberId,
      });
      await sendStudyApplicationNotification(locals.member!.name, title);
      return { operation: "requestSubmitted" as const, requestId: row.id };
    });
    if (isActionFailure(result as unknown)) {
      const failure = result as unknown as ActionFailure<
        Record<string, unknown>
      >;
      return fail(failure.status, {
        ...failure.data,
        operation: "requestSubmitted" as const,
        // Preserve native POST drafts for validation and service failures.
        values: studyRequestValuesFromFormData(data),
      });
    }
    return result;
  },

  withdraw: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const id = formText(await request.formData(), "id");
    const result = await handleUserAction(locals, async () => {
      const parsed = studyTargetIdSchema.safeParse(id);
      if (!parsed.success)
        return fail(400, {
          error: "VALIDATION_FAILED",
          issues: { _form: "철회할 신청을 선택해 주세요." },
        });
      await withdrawStudyRequest(parsed.data, locals.member!.memberId);
      return { operation: "requestWithdrawn" as const, requestId: parsed.data };
    });
    if (isActionFailure(result as unknown)) {
      const failure = result as unknown as ActionFailure<
        Record<string, unknown>
      >;
      return fail(failure.status, {
        ...failure.data,
        operation: "requestWithdrawn" as const,
        requestId: id,
      });
    }
    return result;
  },
};
