import { getTable } from "$lib/server/data/tables";
import { isSeminarType } from "$lib/server/services/events";
import type { LayoutServerLoad } from "./$types";

/** Member zone: the guard already guaranteed an active member. */
export const load: LayoutServerLoad = async (event) => {
  const memberId = event.locals.member?.memberId;

  // PRES-03: the manage link renders for presenters only (cached table read).
  let isPresenter = false;
  if (memberId) {
    try {
      const events = await getTable("events");
      isPresenter = events.some(
        (e) => isSeminarType(e.type) && e.presenterIds.includes(memberId),
      );
    } catch {
      isPresenter = false;
    }
  }

  return {
    session: await event.locals.auth(),
    isMember: true,
    isAdmin: event.locals.member?.isAdmin ?? false,
    isPresenter,
  };
};
