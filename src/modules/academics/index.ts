// Public API of the academics module. Other modules import only from here.
export { getCourses, getLevelName, getStudentCourses, getSubjects } from "./queries";
export type { Course, StudentCourse, Subject } from "./service";
