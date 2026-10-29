// Public API of the CRM module. Other modules import only from here.
export { getBranch, getMyStudent, type Branch, type MyStudent } from "./queries";
export { displayName, initials } from "./service";
