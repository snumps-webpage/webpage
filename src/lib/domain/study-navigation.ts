import { isStudyClosed, type StudyStatus } from "./studies";
export type StudyRelationship =
  "organizer" | "participant" | "pending" | "none";
export function groupStudies<
  T extends { status: StudyStatus; myState: StudyRelationship },
>(studies: readonly T[]) {
  return {
    joinable: studies.filter(
      (study) => study.status === "recruiting" && study.myState === "none",
    ),
    mine: studies.filter((study) => study.myState !== "none"),
    other: studies.filter(
      (study) => study.status !== "recruiting" && study.myState === "none",
    ),
  };
}
export function studyParticipationAction(
  status: StudyStatus,
  relationship: StudyRelationship,
  canParticipate: boolean,
) {
  if (relationship === "organizer") return "manage" as const;
  if (isStudyClosed(status) && relationship !== "none")
    return "closed" as const;
  if (!canParticipate) return "readOnly" as const;
  if (relationship === "participant") return "leave" as const;
  if (relationship === "pending") return "cancel" as const;
  if (status === "recruiting") return "join" as const;
  return "unavailable" as const;
}
