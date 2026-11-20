export const FACULTIES = [
  { id: "arts", name: "Arts" },
  { id: "eng", name: "Engineering" },
  { id: "env", name: "Environment" },
  { id: "health", name: "Health" },
  { id: "math", name: "Mathematics" },
  { id: "sci", name: "Science" },
] as const;

export type FacultyId = (typeof FACULTIES)[number]["id"];

export function facultyName(id: string | null | undefined): string {
  return FACULTIES.find((f) => f.id === id)?.name ?? "—";
}

export function isFacultyId(id: string): id is FacultyId {
  return FACULTIES.some((f) => f.id === id);
}
