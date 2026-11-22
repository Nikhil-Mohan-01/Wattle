// The universities Wattle is open to. A student's university comes from the
// domain of their verified student email. Every university plays the same
// daily puzzles, so scores compare fairly across campuses.
//
// To add a university: add an entry here (exact student email domains only;
// subdomains aren't matched automatically), then deploy.

export type Faculty = { id: string; name: string };

export type University = {
  id: string;
  name: string;
  shortName: string;
  /** Exact domains of student email addresses. */
  domains: string[];
  faculties: Faculty[];
};

const OTHER: Faculty = { id: "other", name: "Other" };

export const UNIVERSITIES: University[] = [
  {
    id: "uwaterloo",
    name: "University of Waterloo",
    shortName: "Waterloo",
    domains: ["uwaterloo.ca"],
    faculties: [
      { id: "arts", name: "Arts" },
      { id: "eng", name: "Engineering" },
      { id: "env", name: "Environment" },
      { id: "health", name: "Health" },
      { id: "math", name: "Mathematics" },
      { id: "sci", name: "Science" },
    ],
  },
  {
    id: "utoronto",
    name: "University of Toronto",
    shortName: "U of T",
    domains: ["mail.utoronto.ca"],
    faculties: [
      { id: "artsci", name: "Arts & Science" },
      { id: "eng", name: "Applied Science & Engineering" },
      { id: "music", name: "Music" },
      { id: "kpe", name: "Kinesiology & Physical Education" },
      { id: "daniels", name: "Architecture, Landscape & Design" },
      { id: "nursing", name: "Nursing" },
      { id: "utm", name: "UTM" },
      { id: "utsc", name: "UTSC" },
      OTHER,
    ],
  },
  {
    id: "mcmaster",
    name: "McMaster University",
    shortName: "McMaster",
    domains: ["mcmaster.ca"],
    faculties: [
      { id: "business", name: "Business" },
      { id: "eng", name: "Engineering" },
      { id: "health", name: "Health Sciences" },
      { id: "humanities", name: "Humanities" },
      { id: "sci", name: "Science" },
      { id: "socsci", name: "Social Sciences" },
      OTHER,
    ],
  },
  {
    id: "western",
    name: "Western University",
    shortName: "Western",
    domains: ["uwo.ca"],
    faculties: [
      { id: "arts", name: "Arts & Humanities" },
      { id: "eng", name: "Engineering" },
      { id: "health", name: "Health Sciences" },
      { id: "fims", name: "Information & Media Studies" },
      { id: "ivey", name: "Ivey Business" },
      { id: "music", name: "Music" },
      { id: "sci", name: "Science" },
      { id: "socsci", name: "Social Science" },
      OTHER,
    ],
  },
  {
    id: "queens",
    name: "Queen's University",
    shortName: "Queen's",
    domains: ["queensu.ca"],
    faculties: [
      { id: "artsci", name: "Arts & Science" },
      { id: "eng", name: "Engineering & Applied Science" },
      { id: "health", name: "Health Sciences" },
      { id: "smith", name: "Smith Business" },
      { id: "edu", name: "Education" },
      OTHER,
    ],
  },
  {
    id: "ubc",
    name: "University of British Columbia",
    shortName: "UBC",
    domains: ["student.ubc.ca"],
    faculties: [
      { id: "arts", name: "Arts" },
      { id: "sci", name: "Science" },
      { id: "apsc", name: "Applied Science" },
      { id: "sauder", name: "Sauder Business" },
      { id: "forestry", name: "Forestry" },
      { id: "lfs", name: "Land & Food Systems" },
      { id: "kin", name: "Kinesiology" },
      { id: "okanagan", name: "UBC Okanagan" },
      OTHER,
    ],
  },
];

/**
 * Universities currently accepting players. ENABLED_UNIVERSITIES (comma-
 * separated ids) narrows the list; unset means all of them.
 */
export function enabledUniversities(): University[] {
  const only = (process.env.ENABLED_UNIVERSITIES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return only.length ? UNIVERSITIES.filter((u) => only.includes(u.id)) : UNIVERSITIES;
}

export function universityById(id: string | null | undefined): University | undefined {
  return UNIVERSITIES.find((u) => u.id === id);
}

/** The enabled university a student email belongs to, if any. */
export function universityForEmail(email: string): University | undefined {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return enabledUniversities().find((u) => u.domains.includes(domain));
}

export function facultyName(universityId: string | null | undefined, facultyId: string | null | undefined): string {
  return universityById(universityId)?.faculties.find((f) => f.id === facultyId)?.name ?? "—";
}

export function isFaculty(universityId: string | null | undefined, facultyId: string): boolean {
  return Boolean(universityById(universityId)?.faculties.some((f) => f.id === facultyId));
}
