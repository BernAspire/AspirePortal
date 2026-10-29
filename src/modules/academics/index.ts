// Public API of the academics module. Other modules import only from here.
export { getCourses, getLevelName, getStudentCourses } from "./queries";
export type { Course, StudentCourse } from "./service";
