import { type FC, type FormEvent, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Briefcase, AlertCircle } from "lucide-react";
import { INDONESIAN_CITIES } from "@/pages/indonesiancities";

const pb = new PocketBase(
  import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090"
);
pb.autoCancellation(false);

const JOBS_COLLECTION = "Jobs";
const OPERATOR_COLLECTION = "Operator_dataset";

interface Job extends RecordModel {
  Job_Title: string;
  Job_Description: string;
  Requirements: string;
  Status: "Open" | "Closed";
}

const EDUCATION_LEVELS = [
  "SD",
  "SMP",
  "SMA/SMK",
  "D3",
  "D4",
  "S1",
  "S2",
  "S3",
  "Other / Lainnya",
];

// Broad, operator-relevant skill options — this is a floor labor / factory
// hiring flow (packaging, sewing, machine operating, etc.), not an office
// role, so the picker leans toward that. "Lainnya" pairs with a free-text
// field for anything not listed.
const SKILL_OPTIONS = [
  "Packaging (Pengemasan)",
  "Sewing (Menjahit)",
  "Machine Operating (Operator Mesin)",
  "Quality Control (QC)",
  "Assembly Line (Perakitan)",
  "Warehouse (Pergudangan)",
  "Forklift Operation",
  "Welding (Las)",
  "Cutting (Pemotongan)",
  "Printing (Percetakan)",
  "Molding (Pencetakan)",
  "Painting (Pengecatan)",
  "Maintenance (Perawatan Mesin)",
  "Inventory / Stock Keeping",
];

interface ApplicationForm {
  First_Name: string;
  Last_Name: string;
  Age: string;
  email: string;
  Phone_Number: string;
  City: string;
  ExperienceYears: string;
  Education: string;
  School: string;
  skillsSelected: string[];
  skillsOther: string;
  Notice_Period: string;
  Is_18_Plus: boolean;
  Legal_Right_To_Work: boolean;
  Former_Current_Mattel_Employee: boolean;
}

function emptyForm(): ApplicationForm {
  return {
    First_Name: "",
    Last_Name: "",
    Age: "",
    email: "",
    Phone_Number: "",
    City: "",
    ExperienceYears: "",
    Education: "",
    School: "",
    skillsSelected: [],
    skillsOther: "",
    Notice_Period: "",
    Is_18_Plus: false,
    Legal_Right_To_Work: false,
    Former_Current_Mattel_Employee: false,
  };
}

export const ApplyPage: FC = () => {
  const { jobId } = useParams<{ jobId: string }>();

  const [job, setJob] = useState<Job | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [jobError, setJobError] = useState<string | null>(null);

  const [form, setForm] = useState<ApplicationForm>(emptyForm());
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [ktpFile, setKtpFile] = useState<File | null>(null);
  const [extractingCV, setExtractingCV] = useState(false);
  const [extractingKTP] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setJobError("No job specified.");
      setLoadingJob(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingJob(true);
      setJobError(null);
      try {
        const record = await pb.collection(JOBS_COLLECTION).getOne<Job>(jobId);
        if (!cancelled) setJob(record);
      } catch (err) {
        console.error("Failed to load job", err);
        if (!cancelled) setJobError("This job posting couldn't be found.");
      } finally {
        if (!cancelled) setLoadingJob(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  function updateField<K extends keyof ApplicationForm>(field: K, value: ApplicationForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleSkill(skill: string) {
    setForm((prev) => ({
      ...prev,
      skillsSelected: prev.skillsSelected.includes(skill)
        ? prev.skillsSelected.filter((s) => s !== skill)
        : [...prev.skillsSelected, skill],
    }));
  }

  async function handleResumeUpload(file: File | null) {
    setResumeFile(file);
    if (!file) return;

    setExtractingCV(true);
    setFormError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("http://127.0.0.1:8000/api/extract-cv", {
        method: "POST",
        body,
      });

      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();

      setForm((prev) => ({
        ...prev,
        First_Name: data.first_name ?? prev.First_Name,
        Last_Name: data.last_name ?? prev.Last_Name,
        Age: data.age != null ? String(data.age) : prev.Age,
        email: data.email ?? prev.email,
        Phone_Number: data.phone ?? prev.Phone_Number,
        City: data.city ?? prev.City,
        ExperienceYears:
          data.work_experience_years != null
            ? String(data.work_experience_years)
            : prev.ExperienceYears,
        Education: data.highest_education ?? prev.Education,
        School: data.school_name ?? prev.School,
        skillsOther: Array.isArray(data.skills) && data.skills.length
          ? data.skills.join(", ")
          : prev.skillsOther,
        Former_Current_Mattel_Employee:
          data.ex_mattel_employee ?? prev.Former_Current_Mattel_Employee,
      }));
    } catch (err) {
      console.error("CV extraction failed", err);
    } finally {
      setExtractingCV(false);
    }
  }

  function validate(): string | null {
    if (!form.First_Name.trim() || !form.Last_Name.trim()) return "Please enter your full name.";
    if (!form.email.trim()) return "Please enter your email address.";
    if (!form.Phone_Number.trim()) return "Please enter your phone number.";
    if (!form.City) return "Please select your city.";
    if (!form.Is_18_Plus) return "You must confirm you're 18 or older to apply.";
    if (!form.Legal_Right_To_Work) return "You must confirm you have the legal right to work.";
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!job) return;

    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const skills = [...form.skillsSelected, ...(form.skillsOther.trim() ? [form.skillsOther.trim()] : [])].join(
      ", "
    );
    const experienceText = form.ExperienceYears
      ? `${form.ExperienceYears} tahun`
      : "";

    try {
      const payload = new FormData();
      payload.append("Candidate_ID", `CAND-${Date.now()}`);
      payload.append("First_Name", form.First_Name.trim());
      payload.append("Last_Name", form.Last_Name.trim());
      payload.append("Age", String(Number(form.Age) || 0));
      payload.append("email", form.email.trim());
      payload.append("Phone_Number", form.Phone_Number.trim());
      payload.append("City", form.City);
      payload.append("Applied_Position", job.Job_Title);
      payload.append("Experience", experienceText);
      payload.append("Education", form.Education);
      payload.append("School", form.School.trim());
      payload.append("Skills", skills);
      payload.append("Notice_Period", form.Notice_Period.trim());
      payload.append("Status", "Applied");
      payload.append("Is_18_Plus", String(form.Is_18_Plus));
      payload.append("Legal_Right_To_Work", String(form.Legal_Right_To_Work));
      payload.append(
        "Former_Current_Mattel_Employee",
        String(form.Former_Current_Mattel_Employee)
      );
      payload.append("date", new Date().toISOString());
      if (resumeFile) {
        payload.append("Resume_Input", resumeFile);
      }

      await pb.collection(OPERATOR_COLLECTION).create(payload);
      setSubmitted(true);
    } catch (err) {
      console.error("Failed to submit application", err);
      setFormError("Something went wrong submitting your application. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingJob) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (jobError || !job) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
            <p className="text-sm text-muted-foreground">{jobError ?? "Job not found."}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (job.Status === "Closed") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">This position is closed</h2>
            <p className="text-sm text-muted-foreground">
              "{job.Job_Title}" is no longer accepting applications.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <h2 className="text-lg font-semibold">Application submitted</h2>
            <p className="text-sm text-muted-foreground">
              Thanks for applying to <span className="font-medium">{job.Job_Title}</span>. We'll
              be in touch if there's a match.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-2xl">{job.Job_Title}</CardTitle>
                <CardDescription className="mt-1">
                  {job.Job_Description}
                </CardDescription>
              </div>
              <Badge className="shrink-0 border-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                Open
              </Badge>
            </div>
          </CardHeader>
          {job.Requirements && (
            <CardContent>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Requirements</p>
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                {job.Requirements}
              </p>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Application Form</CardTitle>
            <CardDescription>Fields marked * are required.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {formError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}

              <div className="space-y-1">
                  <h3 className="text-base font-semibold">Upload Documents</h3>
                  <p className="text-sm text-muted-foreground">
                      Upload your documents first. We'll automatically extract information to help complete your application.
                  </p>
              </div>

              {/* Upload Documents */}
              <div className="rounded-lg border bg-muted/20 p-5 space-y-6">

                <div>
                  <Label htmlFor="Resume_Input" className="text-sm font-semibold">
                    Resume / Curriculum Vitae <span className="text-destructive">*</span>
                  </Label>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Upload your resume first. We'll automatically extract information and
                    fill in the application form for you. Please review the information
                    before submitting.
                  </p>

                  <ul className="mt-2 ml-5 list-disc text-xs text-muted-foreground">
                    <li>Name</li>
                    <li>Email & Phone Number</li>
                    <li>Education</li>
                    <li>Work Experience</li>
                    <li>Skills</li>
                  </ul>

                  <Input
                    id="Resume_Input"
                    type="file"
                    accept=".pdf,.doc,.docx,image/*"
                    onChange={(e) => handleResumeUpload(e.target.files?.[0] ?? null)}
                    className="mt-3 cursor-pointer file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
                  />

                  {resumeFile && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Selected: {resumeFile.name} ({(resumeFile.size / 1024).toFixed(0)} KB)
                    </p>
                  )}

                  {extractingCV && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Extracting information from your CV...
                    </p>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t pt-6">

                  <Label htmlFor="KTP_Input" className="text-sm font-semibold">
                    Indonesian Identity Card (KTP)
                  </Label>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Upload your Indonesian Identity Card (KTP). Automatic extraction will be
                    available soon.
                  </p>

                  <ul className="mt-2 ml-5 list-disc text-xs text-muted-foreground">
                    <li>Full Name</li>
                    <li>NIK</li>
                    <li>Date of Birth</li>
                    <li>Address</li>
                    <li>Gender</li>
                  </ul>

                  <Input
                    id="KTP_Input"
                    type="file"
                    accept=".pdf,image/*"
                    onChange={(e) => setKtpFile(e.target.files?.[0] ?? null)}
                    className="mt-3 cursor-pointer file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/20"
                  />

                  {ktpFile && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Selected: {ktpFile.name} ({(ktpFile.size / 1024).toFixed(0)} KB)
                    </p>
                  )}

                  {extractingKTP && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Extracting information from your KTP...
                    </p>
                  )}

                </div>

              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nama depan (First name)" htmlFor="First_Name" required>
                  <Input
                    id="First_Name"
                    value={form.First_Name}
                    onChange={(e) => updateField("First_Name", e.target.value)}
                    required
                  />
                </Field>
                <Field label="Nama belakang (Last name)" htmlFor="Last_Name" required>
                  <Input
                    id="Last_Name"
                    value={form.Last_Name}
                    onChange={(e) => updateField("Last_Name", e.target.value)}
                    required
                  />
                </Field>

                <Field label="Usia (Age)" htmlFor="Age">
                  <Input
                    id="Age"
                    type="number"
                    min={0}
                    value={form.Age}
                    onChange={(e) => updateField("Age", e.target.value)}
                  />
                </Field>
                <Field label="Alamat email (Email)" htmlFor="email" required>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    required
                  />
                </Field>

                <Field label="Nomor telepon (Phone)" htmlFor="Phone_Number" required>
                  <Input
                    id="Phone_Number"
                    value={form.Phone_Number}
                    onChange={(e) => updateField("Phone_Number", e.target.value)}
                    placeholder="08xx-xxxx-xxxx"
                    required
                  />
                </Field>

                <Field label="Kota domisili (City)" htmlFor="City" required>
                  <select
                    id="City"
                    value={form.City}
                    onChange={(e) => updateField("City", e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    required
                  >
                    <option value="" disabled>
                      Select a city…
                    </option>
                    {INDONESIAN_CITIES.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Tingkat pendidikan (Education)" htmlFor="Education">
                  <select
                    id="Education"
                    value={form.Education}
                    onChange={(e) => updateField("Education", e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="" disabled>
                      Select…
                    </option>
                    {EDUCATION_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Nama sekolah/universitas (School)" htmlFor="School">
                  <Input
                    id="School"
                    value={form.School}
                    onChange={(e) => updateField("School", e.target.value)}
                  />
                </Field>

                <Field label="Periode pemberitahuan (Notice period)" htmlFor="Notice_Period">
                  <Input
                    id="Notice_Period"
                    value={form.Notice_Period}
                    onChange={(e) => updateField("Notice_Period", e.target.value)}
                    placeholder="e.g. 1 month, Immediate"
                  />
                </Field>
              </div>

              <Field label="Pengalaman kerja (Years of experience)" htmlFor="ExperienceYears">
                <div className="flex items-center gap-2">
                  <Input
                    id="ExperienceYears"
                    type="number"
                    min={0}
                    step={1}
                    value={form.ExperienceYears}
                    onChange={(e) => updateField("ExperienceYears", e.target.value)}
                    placeholder="0"
                    className="max-w-[120px]"
                  />
                  <span className="text-sm text-muted-foreground">tahun (years)</span>
                </div>
              </Field>

              <div className="space-y-2">
                <Label className="text-xs font-medium">Keahlian (Skills)</Label>
                <div className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                  {SKILL_OPTIONS.map((skill) => (
                    <label key={skill} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.skillsSelected.includes(skill)}
                        onChange={() => toggleSkill(skill)}
                        className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                      />
                      {skill}
                    </label>
                  ))}
                </div>
                <Input
                  value={form.skillsOther}
                  onChange={(e) => updateField("skillsOther", e.target.value)}
                  placeholder="Keahlian lainnya (Other skills, comma-separated)"
                />
              </div>

              <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                <CheckboxField
                  id="Is_18_Plus"
                  label="Saya berusia 18 tahun ke atas (I am 18 years or older) *"
                  checked={form.Is_18_Plus}
                  onChange={(v) => updateField("Is_18_Plus", v)}
                />
                <CheckboxField
                  id="Legal_Right_To_Work"
                  label="Saya memiliki hak izin kerja yang sah (I have legal right to work) *"
                  checked={form.Legal_Right_To_Work}
                  onChange={(v) => updateField("Legal_Right_To_Work", v)}
                />
                <CheckboxField
                  id="Former_Current_Mattel_Employee"
                  label="Saya pernah/sedang menjadi karyawan Mattel (Former/current Mattel employee)"
                  checked={form.Former_Current_Mattel_Employee}
                  onChange={(v) => updateField("Former_Current_Mattel_Employee", v)}
                />
              </div>

              <Button type="submit" className="w-full gap-2" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit Application
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline underline-offset-2">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ApplyPage;

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

const Field: FC<{
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, htmlFor, required, hint, children }) => (
  <div className="space-y-1.5">
    <Label htmlFor={htmlFor} className="text-xs font-medium">
      {label}
      {required && <span className="text-destructive"> *</span>}
      {hint && <span className="ml-1 font-normal text-muted-foreground">({hint})</span>}
    </Label>
    {children}
  </div>
);

const CheckboxField: FC<{
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ id, label, checked, onChange }) => (
  <label htmlFor={id} className="flex cursor-pointer items-start gap-2 text-sm">
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
    />
    <span>{label}</span>
  </label>
);