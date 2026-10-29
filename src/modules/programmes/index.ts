// Public API of the programmes module. Other modules import only from here.
export { getActiveEntitlements } from "./queries";
export { activeEntitlements, type ActiveEntitlement } from "./service";
export { PROGRAMME_KIND_LABELS, type ProgrammeKind } from "./schema";
