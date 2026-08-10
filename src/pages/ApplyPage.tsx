import { type FC, type FormEvent, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import PocketBase from "pocketbase";
import type { RecordModel } from "pocketbase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Briefcase, AlertCircle } from "lucide-react";
import { INDONESIAN_CITIES } from "@/pages/indonesiancities";

const pb = new PocketBase(
  import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090"
);
pb.autoCancellation(false);

// Set this in .env — see note at the bottom of the form for what it enables.
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

const JOBS_COLLECTION = "Jobs";
const OPERATOR_COLLECTION = "Operator_dataset";

interface Job extends RecordModel {
  Job_Title: string;
  Job_Description: string;
  Requirements: string;
  Status: "Open" | "Closed";
}

// ---------------------------------------------------------------------------
// Option lists
// ---------------------------------------------------------------------------

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

const GENDER_OPTIONS = ["Laki-laki (Male)", "Perempuan (Female)"];

const RELIGION_OPTIONS = [
  "Islam",
  "Kristen Protestan",
  "Katolik",
  "Hindu",
  "Buddha",
  "Khonghucu",
  "Other / Lainnya",
];

const MARITAL_STATUS_OPTIONS = [
  "Single / Belum Menikah",
  "Married / Menikah",
  "Widowed / Janda / Duda",
];

const EDUCATION_LEVEL_CHECKBOXES = ["SMA/SMK", "D3", "S1", "S2", "S3"];

const UNIFORM_SIZES = ["S", "M", "L", "XL", "XXL", "XXXL", "XXXXL"];

const CERTIFICATE_OPTIONS = ["STR", "Komputer", "Forklift"];

const SKILL_OPTIONS = [
  "Sewing",
  "Microsoft Office (Word, Excel, PowerPoint)",
  "Programming",
  "Web Developer",
  "Hardware Komputer",
  "PLC",
  "SolidWork",
  "CNC",
  "Corel Draw",
  "Design Grafis",
  "Printing",
  "Macro Excel",
  "Power BI",
];

const LANGUAGE_OPTIONS = ["Bahasa Indonesia", "English", "Mandarin", "Japanese", "Korean", "Other"];

const LANGUAGE_PROFICIENCY_OPTIONS = ["Basic", "Intermediate", "Advanced", "Native / Fluent"];

const ACQUAINTANCE_RELATIONSHIP_OPTIONS = [
  "Parents / Orang Tua",
  "Sibling / Saudara Kandung",
  "Aunt or Uncle / Paman atau Bibi",
  "Cousin / Saudara Sepupu",
  "Friend / Teman",
  "Other relative / Kerabat lainnya",
];

const YES_NO = ["Yes", "No"];

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface LanguageSkill {
  language: string;
  proficiency: string;
}

interface ChildEntry {
  id: string;
  Child_Name: string;
  Child_Gender: string;
  Child_Date_Of_Birth: string;
  Child_Education: string;
}

interface ApplicationForm {
  // Basic identity (kept from before)
  First_Name: string;
  Last_Name: string;
  Age: string;
  email: string;
  Phone_Number: string;
  City: string;
  ExperienceYears: string;
  Education: string;
  School: string;
  skillsOther: string;
  Notice_Period: string;
  Is_18_Plus: boolean;
  Legal_Right_To_Work: boolean;
  Former_Current_Mattel_Employee: boolean;
  Consent_Data_Collection: boolean;
  Consent_Data_Usage: boolean;
  Consent_Data_Retention: boolean;

  // KTP-derived identity
  Gender: string;
  Place_Of_Birth: string;
  Date_Of_Birth: string;
  KTP_Address: string;
  RT: string;
  RW: string;
  Kelurahan: string;
  Kecamatan: string;
  Kota_Kabupaten: string;
  Provinsi: string;
  Zip_Code: string;

  // Present address (Google Maps autocomplete) — only used when different from KTP address
  Present_Address_Same_As_KTP: boolean;
  Present_Address: string;
  Present_Address_City: string;
  Present_Address_Province: string;
  Present_Address_Zip_Code: string;

  // Contact / identity numbers
  Mobile_Phone_WA: string;
  Identity_Card_Number: string;
  Family_Card_Number: string;
  Religion: string;

  // Emergency contact
  Emergency_Contact_Name: string;
  Emergency_Contact_Relationship: string;
  Emergency_Contact_Phone: string;
  Emergency_Contact_Address_Same_As_Me: boolean;
  Emergency_Contact_Address: string;
  Emergency_Contact_City: string;
  Emergency_Contact_Province: string;
  Emergency_Contact_Zip_Code: string;

  // Education detail — Education_Levels_Selected drives which blocks below show
  Education_Levels_Selected: string[];
  HS_Name: string;
  HS_Location: string;
  HS_Major: string;
  HS_Graduation_Year: string;
  Academy_Name: string;
  Academy_Location: string;
  Academy_Major: string;
  Academy_Graduation_Year: string;
  Bachelor_University_Name: string;
  Bachelor_Location: string;
  Bachelor_Major: string;
  Bachelor_Graduation_Year: string;
  Master_University_Name: string;
  Master_Location: string;
  Master_Major: string;
  Master_Graduation_Year: string;
  Doctorate_University_Name: string;
  Doctorate_Location: string;
  Doctorate_Major: string;
  Doctorate_Graduation_Year: string;

  // Certificates / skills / languages
  certificatesSelected: string[];
  certificatesOther: string;
  skillsSelected: string[];
  languageSkills: LanguageSkill[];

  // Job history (most recent, entry 1)
  Company_Name_1: string;
  Last_Position_1: string;
  Business_Type_1: string;
  Job_Description_1: string;
  Start_Date_1: string;
  Still_Working_1: boolean;
  Finish_Date_1: string;
  Reason_For_Leaving_1: string;
  Recent_Gross_Monthly_Salary_1: string;
  Employer_Supervisor_Name_1: string;
  Employer_Supervisor_Position_1: string;
  Employer_Supervisor_Phone_1: string;
  Period_Known_Of_Employer_1: string;

  // Background
  Marital_Status: string;
  Spouse_Name: string;
  Spouse_Date_Of_Birth: string;
  Spouse_Gender: string;
  Spouse_Education: string;
  Children: ChildEntry[];
  Previously_Applied: string; // "Yes" | "No"
  Previous_Application_Date: string;
  Previous_Position_Applied: string;
  Objection_To_Reference_Check: string; // "Yes" | "No"
  Acquaintance_At_Mattel: string; // "Yes" | "No"
  Acquaintance_Name: string;
  Acquaintance_Relationship: string;

  // Offer details
  Expected_Gross_Monthly_Salary: string;
  Available_Start_Date: string;
  Uniform_Size: string;
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
    skillsOther: "",
    Notice_Period: "",
    Is_18_Plus: false,
    Legal_Right_To_Work: false,
    Former_Current_Mattel_Employee: false,
    Consent_Data_Collection: false,
    Consent_Data_Usage: false,
    Consent_Data_Retention: false,

    Gender: "",
    Place_Of_Birth: "",
    Date_Of_Birth: "",
    KTP_Address: "",
    RT: "",
    RW: "",
    Kelurahan: "",
    Kecamatan: "",
    Kota_Kabupaten: "",
    Provinsi: "",
    Zip_Code: "",

    Present_Address_Same_As_KTP: true,
    Present_Address: "",
    Present_Address_City: "",
    Present_Address_Province: "",
    Present_Address_Zip_Code: "",

    Mobile_Phone_WA: "",
    Identity_Card_Number: "",
    Family_Card_Number: "",
    Religion: "",

    Emergency_Contact_Name: "",
    Emergency_Contact_Relationship: "",
    Emergency_Contact_Phone: "",
    Emergency_Contact_Address_Same_As_Me: true,
    Emergency_Contact_Address: "",
    Emergency_Contact_City: "",
    Emergency_Contact_Province: "",
    Emergency_Contact_Zip_Code: "",

    Education_Levels_Selected: [],
    HS_Name: "",
    HS_Location: "",
    HS_Major: "",
    HS_Graduation_Year: "",
    Academy_Name: "",
    Academy_Location: "",
    Academy_Major: "",
    Academy_Graduation_Year: "",
    Bachelor_University_Name: "",
    Bachelor_Location: "",
    Bachelor_Major: "",
    Bachelor_Graduation_Year: "",
    Master_University_Name: "",
    Master_Location: "",
    Master_Major: "",
    Master_Graduation_Year: "",
    Doctorate_University_Name: "",
    Doctorate_Location: "",
    Doctorate_Major: "",
    Doctorate_Graduation_Year: "",

    certificatesSelected: [],
    certificatesOther: "",
    skillsSelected: [],
    languageSkills: [],

    Company_Name_1: "",
    Last_Position_1: "",
    Business_Type_1: "",
    Job_Description_1: "",
    Start_Date_1: "",
    Still_Working_1: false,
    Finish_Date_1: "",
    Reason_For_Leaving_1: "",
    Recent_Gross_Monthly_Salary_1: "",
    Employer_Supervisor_Name_1: "",
    Employer_Supervisor_Position_1: "",
    Employer_Supervisor_Phone_1: "",
    Period_Known_Of_Employer_1: "",

    Marital_Status: "",
    Spouse_Name: "",
    Spouse_Date_Of_Birth: "",
    Spouse_Gender: "",
    Spouse_Education: "",
    Children: [],
    Previously_Applied: "",
    Previous_Application_Date: "",
    Previous_Position_Applied: "",
    Objection_To_Reference_Check: "",
    Acquaintance_At_Mattel: "",
    Acquaintance_Name: "",
    Acquaintance_Relationship: "",

    Expected_Gross_Monthly_Salary: "",
    Available_Start_Date: "",
    Uniform_Size: "",
  };
}

// ---------------------------------------------------------------------------
// Google Places Autocomplete loader
// ---------------------------------------------------------------------------

let mapsLoadPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error("No API key configured"));
  if (mapsLoadPromise) return mapsLoadPromise;

  mapsLoadPromise = new Promise((resolve, reject) => {
    if ((window as any).google?.maps?.places) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });

  return mapsLoadPromise;
}

function componentFromPlace(
  place: google.maps.places.PlaceResult,
  types: string[]
): string {
  const comp = place.address_components?.find((c) => types.every((t) => c.types.includes(t)) || types.some((t) => c.types.includes(t)));
  return comp?.long_name ?? "";
}

/**
 * Free-text address input that upgrades to Google Places Autocomplete once
 * VITE_GOOGLE_MAPS_API_KEY is set. Falls back to a plain text field (with a
 * hint) if the key isn't configured yet.
 */
const AddressAutocompleteField: FC<{
  id: string;
  value: string;
  onChangeText: (value: string) => void;
  onPlaceSelected: (parts: { city: string; province: string; zip: string; formatted: string }) => void;
  placeholder?: string;
}> = ({ id, value, onChangeText, onPlaceSelected, placeholder }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mapsReady, setMapsReady] = useState(false);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !inputRef.current) return;
        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: "id" },
          fields: ["address_components", "formatted_address"],
        });
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          if (!place.address_components) return;
          const city =
            componentFromPlace(place, ["administrative_area_level_2"]) ||
            componentFromPlace(place, ["locality"]);
          const province = componentFromPlace(place, ["administrative_area_level_1"]);
          const zip = componentFromPlace(place, ["postal_code"]);
          const formatted = place.formatted_address ?? inputRef.current?.value ?? "";
          onChangeText(formatted);
          onPlaceSelected({ city, province, zip, formatted });
        });
        setMapsReady(true);
      })
      .catch(() => setMapsReady(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Input
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => onChangeText(e.target.value)}
        placeholder={placeholder ?? "Start typing an address…"}
      />
      {!GOOGLE_MAPS_API_KEY && (
        <p className="mt-1 text-xs text-muted-foreground">
          Address autocomplete not configured yet — type the full address manually.
        </p>
      )}
      {GOOGLE_MAPS_API_KEY && !mapsReady && (
        <p className="mt-1 text-xs text-muted-foreground">Loading address suggestions…</p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const ApplyPage: FC = () => {
  const { jobId } = useParams<{ jobId: string }>();

  const [job, setJob] = useState<Job | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [jobError, setJobError] = useState<string | null>(null);

  const [form, setForm] = useState<ApplicationForm>(emptyForm());
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [ktpFile, setKtpFile] = useState<File | null>(null);
  const [extractingCV, setExtractingCV] = useState(false);
  const [extractingKTP, setExtractingKTP] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Tracks which fields currently hold a value we auto-filled (from CV or
  // KTP), as opposed to something the user typed themselves. Lets a later
  // auto-fill safely overwrite an earlier auto-filled guess, without ever
  // overwriting something the user corrected by hand.
  const autoFilledFields = useRef<Set<keyof ApplicationForm>>(new Set());

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
    autoFilledFields.current.delete(field);
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Applies an auto-filled value unless the field currently holds something
  // the user typed themselves (i.e. it has a non-empty/non-default value AND
  // isn't marked as auto-filled). Empty/undefined incoming values are ignored.
  function applyAutoFilled<K extends keyof ApplicationForm>(
    prev: ApplicationForm,
    field: K,
    value: ApplicationForm[K] | null | undefined
  ): ApplicationForm[K] {
    if (value === null || value === undefined || value === "") return prev[field];
    // Treat empty string / false (checkbox defaults) as not user-owned so
    // auto-fill can still populate them. Once the user edits the field,
    // updateField removes it from autoFilledFields and the non-empty check
    // (or explicit toggle for booleans) protects it.
    const isEmptyish =
      prev[field] === "" ||
      prev[field] === false ||
      prev[field] === undefined ||
      prev[field] === null;
    const userOwned = !isEmptyish && !autoFilledFields.current.has(field);
    if (userOwned) return prev[field];
    autoFilledFields.current.add(field);
    return value;
  }

  function toggleInList(
    field: "skillsSelected" | "certificatesSelected" | "Education_Levels_Selected",
    value: string
  ) {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((s) => s !== value)
        : [...prev[field], value],
    }));
  }

  function addChild() {
    setForm((prev) => ({
      ...prev,
      Children: [
        ...prev.Children,
        {
          id: `child-${Date.now()}-${prev.Children.length}`,
          Child_Name: "",
          Child_Gender: "",
          Child_Date_Of_Birth: "",
          Child_Education: "",
        },
      ],
    }));
  }

  function removeChild(id: string) {
    setForm((prev) => ({ ...prev, Children: prev.Children.filter((c) => c.id !== id) }));
  }

  function updateChild<K extends keyof ChildEntry>(id: string, field: K, value: ChildEntry[K]) {
    setForm((prev) => ({
      ...prev,
      Children: prev.Children.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    }));
  }

  function toggleLanguage(language: string) {
    setForm((prev) => {
      const exists = prev.languageSkills.find((l) => l.language === language);
      return {
        ...prev,
        languageSkills: exists
          ? prev.languageSkills.filter((l) => l.language !== language)
          : [...prev.languageSkills, { language, proficiency: LANGUAGE_PROFICIENCY_OPTIONS[0] }],
      };
    });
  }

  function setLanguageProficiency(language: string, proficiency: string) {
    setForm((prev) => ({
      ...prev,
      languageSkills: prev.languageSkills.map((l) =>
        l.language === language ? { ...l, proficiency } : l
      ),
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

      setForm((prev) => {
        const next = { ...prev };
        const careerFields: Partial<Record<keyof ApplicationForm, unknown>> = {
          Age: data.age != null ? String(data.age) : undefined,
          email: data.email ?? undefined,
          Phone_Number: data.phone ?? undefined,
          Mobile_Phone_WA: data.phone ?? undefined,
          ExperienceYears:
            data.work_experience_years != null ? String(data.work_experience_years) : undefined,
          Education: data.highest_education ?? undefined,
          School: data.school_name ?? undefined,
          skillsOther:
            Array.isArray(data.skills) && data.skills.length ? data.skills.join(", ") : undefined,
          Former_Current_Mattel_Employee: data.ex_mattel_employee ?? undefined,
        };
        (Object.keys(careerFields) as (keyof ApplicationForm)[]).forEach((key) => {
          (next as any)[key] = applyAutoFilled(prev, key, careerFields[key] as any);
        });

        // Name and City: CV is a fallback guess only, never overwrites anything
        // already there (including a KTP-derived value) — KTP is authoritative
        // for name, and City is meant to reflect current residence, not a guess.
        if (!prev.First_Name && data.first_name) {
          next.First_Name = data.first_name;
          autoFilledFields.current.add("First_Name");
        }
        if (!prev.Last_Name && data.last_name) {
          next.Last_Name = data.last_name;
          autoFilledFields.current.add("Last_Name");
        }
        if (!prev.City && data.city) {
          next.City = data.city;
          autoFilledFields.current.add("City");
        }

        return next;
      });
    } catch (err) {
      console.error("CV extraction failed", err);
    } finally {
      setExtractingCV(false);
    }
  }

  async function handleKtpUpload(file: File | null) {
    setKtpFile(file);
    if (!file) return;

    setExtractingKTP(true);
    setFormError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("http://127.0.0.1:8000/api/extract-ktp", {
        method: "POST",
        body,
      });

      if (!res.ok) throw new Error(`Server responded ${res.status}`);
      const data = await res.json();

      setForm((prev) => {
        const next = { ...prev };
        const [ktpFirstName, ...ktpLastNameParts] = (data.nama ?? "").trim().split(/\s+/);
        const ktpLastName = ktpLastNameParts.join(" ");

        const identityFields: Partial<Record<keyof ApplicationForm, unknown>> = {
          First_Name: data.nama ? ktpFirstName : undefined,
          Last_Name: data.nama ? ktpLastName : undefined,
          Gender: data.jenis_kelamin ?? undefined,
          Place_Of_Birth: data.tempat_lahir ?? undefined,
          Date_Of_Birth: data.tanggal_lahir ?? undefined,
          KTP_Address: data.alamat ?? undefined,
          RT: data.rt ?? undefined,
          RW: data.rw ?? undefined,
          Kelurahan: data.kelurahan_desa ?? undefined,
          Kecamatan: data.kecamatan ?? undefined,
          Kota_Kabupaten: data.kota_kabupaten ?? undefined,
          Provinsi: data.provinsi ?? undefined,
          Religion: data.agama ?? undefined,
          Marital_Status: data.status_perkawinan ?? undefined,
          Identity_Card_Number: data.nik_confident ? data.nik : undefined,
        };
        (Object.keys(identityFields) as (keyof ApplicationForm)[]).forEach((key) => {
          (next as any)[key] = applyAutoFilled(prev, key, identityFields[key] as any);
        });

        return next;
      });
    } catch (err) {
      console.error("KTP extraction failed", err);
    } finally {
      setExtractingKTP(false);
    }
  }

  function validate(): string | null {
    if (!form.Consent_Data_Collection || !form.Consent_Data_Usage || !form.Consent_Data_Retention) {
      return "Please agree to all three Personal Data Consent statements to continue.";
    }
    if (!form.First_Name.trim() || !form.Last_Name.trim()) return "Please enter your full name.";
    if (!form.email.trim()) return "Please enter your email address.";
    if (!form.Mobile_Phone_WA.trim()) return "Please enter your active WhatsApp number.";
    if (!form.City) return "Please select your city.";
    if (!form.Present_Address_Same_As_KTP && !form.Present_Address.trim()) {
      return "Please enter your present address, or tick 'I live at this address' above.";
    }
    if (form.Education_Levels_Selected.length === 0) {
      return "Please tick at least one education level.";
    }
    if (form.Identity_Card_Number && form.Identity_Card_Number.trim().length !== 16) {
      return "Identity Card Number (KTP) must be exactly 16 digits.";
    }
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
    const certificates = [
      ...form.certificatesSelected,
      ...(form.certificatesOther.trim() ? [form.certificatesOther.trim()] : []),
    ].join(", ");
    const languages = form.languageSkills
      .map((l) => `${l.language} (${l.proficiency})`)
      .join(", ");
    const experienceText = form.ExperienceYears ? `${form.ExperienceYears} tahun` : "";
    const effectivePresentAddress = form.Present_Address_Same_As_KTP ? form.KTP_Address : form.Present_Address;
    const effectivePresentCity = form.Present_Address_Same_As_KTP ? form.Kota_Kabupaten : form.Present_Address_City;
    const effectivePresentProvince = form.Present_Address_Same_As_KTP ? form.Provinsi : form.Present_Address_Province;
    const effectivePresentZip = form.Present_Address_Same_As_KTP ? form.Zip_Code : form.Present_Address_Zip_Code;
    const emergencyAddress = form.Emergency_Contact_Address_Same_As_Me
      ? effectivePresentAddress
      : form.Emergency_Contact_Address;
    const emergencyCity = form.Emergency_Contact_Address_Same_As_Me
      ? effectivePresentCity
      : form.Emergency_Contact_City;
    const emergencyProvince = form.Emergency_Contact_Address_Same_As_Me
      ? effectivePresentProvince
      : form.Emergency_Contact_Province;
    const emergencyZip = form.Emergency_Contact_Address_Same_As_Me
      ? effectivePresentZip
      : form.Emergency_Contact_Zip_Code;

    try {
      const payload = new FormData();
      payload.append("Candidate_ID", `CAND-${Date.now()}`);

      // Basic identity
      payload.append("First_Name", form.First_Name.trim());
      payload.append("Last_Name", form.Last_Name.trim());
      payload.append("Age", String(Number(form.Age) || 0));
      payload.append("email", form.email.trim());
      payload.append("Phone_Number", form.Mobile_Phone_WA.trim());
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
      payload.append("Consent_Data_Collection", String(form.Consent_Data_Collection));
      payload.append("Consent_Data_Usage", String(form.Consent_Data_Usage));
      payload.append("Consent_Data_Retention", String(form.Consent_Data_Retention));
      payload.append("date", new Date().toISOString());

      // KTP-derived identity
      payload.append("Gender", form.Gender);
      payload.append("Place_Of_Birth", form.Place_Of_Birth.trim());
      payload.append("Date_Of_Birth", form.Date_Of_Birth);
      payload.append("KTP_Address", form.KTP_Address.trim());
      payload.append("RT", form.RT.trim());
      payload.append("RW", form.RW.trim());
      payload.append("Kelurahan", form.Kelurahan.trim());
      payload.append("Kecamatan", form.Kecamatan.trim());
      payload.append("Kota_Kabupaten", form.Kota_Kabupaten.trim());
      payload.append("Provinsi", form.Provinsi.trim());
      payload.append("Zip_Code", form.Zip_Code.trim());

      // Present address
      payload.append("Present_Address_Same_As_KTP", String(form.Present_Address_Same_As_KTP));
      payload.append("Present_Address", effectivePresentAddress.trim());
      payload.append("Present_Address_City", effectivePresentCity.trim());
      payload.append("Present_Address_Province", effectivePresentProvince.trim());
      payload.append("Present_Address_Zip_Code", effectivePresentZip.trim());

      // Contact / identity numbers
      payload.append("Mobile_Phone_WA", form.Mobile_Phone_WA.trim());
      payload.append("Identity_Card_Number", form.Identity_Card_Number.trim());
      payload.append("Family_Card_Number", form.Family_Card_Number.trim());
      payload.append("Religion", form.Religion);

      // Emergency contact
      payload.append("Emergency_Contact_Name", form.Emergency_Contact_Name.trim());
      payload.append("Emergency_Contact_Relationship", form.Emergency_Contact_Relationship.trim());
      payload.append("Emergency_Contact_Phone", form.Emergency_Contact_Phone.trim());
      payload.append(
        "Emergency_Contact_Address_Same_As_Me",
        String(form.Emergency_Contact_Address_Same_As_Me)
      );
      payload.append("Emergency_Contact_Address", emergencyAddress.trim());
      payload.append("Emergency_Contact_City", emergencyCity.trim());
      payload.append("Emergency_Contact_Province", emergencyProvince.trim());
      payload.append("Emergency_Contact_Zip_Code", emergencyZip.trim());

      // Education detail
      payload.append("Education_Levels", form.Education_Levels_Selected.join(", "));
      payload.append("HS_Name", form.HS_Name.trim());
      payload.append("HS_Location", form.HS_Location.trim());
      payload.append("HS_Major", form.HS_Major.trim());
      payload.append("HS_Graduation_Year", form.HS_Graduation_Year.trim());
      payload.append("Academy_Name", form.Academy_Name.trim());
      payload.append("Academy_Location", form.Academy_Location.trim());
      payload.append("Academy_Major", form.Academy_Major.trim());
      payload.append("Academy_Graduation_Year", form.Academy_Graduation_Year.trim());
      payload.append("Bachelor_University_Name", form.Bachelor_University_Name.trim());
      payload.append("Bachelor_Location", form.Bachelor_Location.trim());
      payload.append("Bachelor_Major", form.Bachelor_Major.trim());
      payload.append("Bachelor_Graduation_Year", form.Bachelor_Graduation_Year.trim());
      payload.append("Master_University_Name", form.Master_University_Name.trim());
      payload.append("Master_Location", form.Master_Location.trim());
      payload.append("Master_Major", form.Master_Major.trim());
      payload.append("Master_Graduation_Year", form.Master_Graduation_Year.trim());
      payload.append("Doctorate_University_Name", form.Doctorate_University_Name.trim());
      payload.append("Doctorate_Location", form.Doctorate_Location.trim());
      payload.append("Doctorate_Major", form.Doctorate_Major.trim());
      payload.append("Doctorate_Graduation_Year", form.Doctorate_Graduation_Year.trim());

      // Certificates / skills / languages
      payload.append("Certificates", certificates);
      payload.append("Languages", languages);

      // Job history (entry 1)
      payload.append("Company_Name_1", form.Company_Name_1.trim());
      payload.append("Last_Position_1", form.Last_Position_1.trim());
      payload.append("Business_Type_1", form.Business_Type_1.trim());
      payload.append("Job_Description_1", form.Job_Description_1.trim());
      payload.append("Start_Date_1", form.Start_Date_1);
      payload.append("Still_Working_1", String(form.Still_Working_1));
      payload.append("Finish_Date_1", form.Still_Working_1 ? "" : form.Finish_Date_1);
      payload.append("Reason_For_Leaving_1", form.Reason_For_Leaving_1.trim());
      payload.append("Recent_Gross_Monthly_Salary_1", form.Recent_Gross_Monthly_Salary_1.trim());
      payload.append("Employer_Supervisor_Name_1", form.Employer_Supervisor_Name_1.trim());
      payload.append("Employer_Supervisor_Position_1", form.Employer_Supervisor_Position_1.trim());
      payload.append("Employer_Supervisor_Phone_1", form.Employer_Supervisor_Phone_1.trim());
      payload.append("Period_Known_Of_Employer_1", form.Period_Known_Of_Employer_1.trim());

      // Background
      const isMarried = form.Marital_Status === "Married / Menikah";
      payload.append("Marital_Status", form.Marital_Status);
      payload.append("Spouse_Name", isMarried ? form.Spouse_Name.trim() : "");
      payload.append("Spouse_Date_Of_Birth", isMarried ? form.Spouse_Date_Of_Birth : "");
      payload.append("Spouse_Gender", isMarried ? form.Spouse_Gender : "");
      payload.append("Spouse_Education", isMarried ? form.Spouse_Education : "");
      payload.append("Number_Of_Child", isMarried ? String(form.Children.length) : "0");
      payload.append("Children", isMarried ? JSON.stringify(form.Children) : "[]");
      payload.append("Previously_Applied", form.Previously_Applied);
      payload.append(
        "Previous_Application_Date",
        form.Previously_Applied === "Yes" ? form.Previous_Application_Date : ""
      );
      payload.append(
        "Previous_Position_Applied",
        form.Previously_Applied === "Yes" ? form.Previous_Position_Applied.trim() : ""
      );
      payload.append("Objection_To_Reference_Check", form.Objection_To_Reference_Check);
      payload.append("Acquaintance_At_Mattel", form.Acquaintance_At_Mattel);
      payload.append(
        "Acquaintance_Name",
        form.Acquaintance_At_Mattel === "Yes" ? form.Acquaintance_Name.trim() : ""
      );
      payload.append(
        "Acquaintance_Relationship",
        form.Acquaintance_At_Mattel === "Yes" ? form.Acquaintance_Relationship : ""
      );

      // Offer details
      payload.append("Expected_Gross_Monthly_Salary", form.Expected_Gross_Monthly_Salary.trim());
      payload.append("Available_Start_Date", form.Available_Start_Date);
      payload.append("Uniform_Size", form.Uniform_Size);

      if (resumeFile) payload.append("Resume_Input", resumeFile);
      if (ktpFile) payload.append("KTP_Input", ktpFile);

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
                <CardDescription className="mt-1">{job.Job_Description}</CardDescription>
              </div>
              <Badge className="shrink-0 border-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                Open
              </Badge>
            </div>
          </CardHeader>
          {job.Requirements && (
            <CardContent>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Requirements</p>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{job.Requirements}</p>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Application Form</CardTitle>
            <CardDescription>Fields marked * are required.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {formError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}

              <div className="space-y-4 rounded-lg border bg-muted/20 p-5">
                <div>
                  <h3 className="text-base font-semibold">
                    Personal Data Consent <span className="text-destructive">*</span>
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Persetujuan Data Pribadi
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-sm">
                      1. I have read and understood the statement above, and I consent to PT
                      Mattel Indonesia collecting, using, storing, verifying, and processing my
                      personal data for recruitment purposes.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Saya telah membaca dan memahami pernyataan di atas, dan saya menyetujui PT
                      Mattel Indonesia untuk mengumpulkan, menggunakan, menyimpan, memverifikasi,
                      dan memproses data pribadi saya untuk keperluan rekrutmen.
                    </p>
                    <CheckboxField
                      id="Consent_Data_Collection"
                      label="I Agree / Saya Setuju"
                      checked={form.Consent_Data_Collection}
                      onChange={(v) => updateField("Consent_Data_Collection", v)}
                    />
                  </div>

                  <div className="border-t pt-3">
                    <p className="text-sm">
                      2. I understand that my personal data may be used for reviewing my
                      application, contacting me, arranging interviews and assessments,
                      conducting reference checks, verifying information, and maintaining
                      recruitment records.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Saya memahami bahwa data pribadi saya dapat digunakan untuk meninjau lamaran
                      saya, menghubungi saya, mengatur wawancara dan asesmen, melakukan pengecekan
                      referensi, memverifikasi informasi, dan menyimpan catatan rekrutmen.
                    </p>
                    <CheckboxField
                      id="Consent_Data_Usage"
                      label="I Agree / Saya Setuju"
                      checked={form.Consent_Data_Usage}
                      onChange={(v) => updateField("Consent_Data_Usage", v)}
                    />
                  </div>

                  <div className="border-t pt-3">
                    <p className="text-sm">
                      3. I understand that my personal data will be retained for up to six (6)
                      months after the recruitment process for the relevant position has ended,
                      unless a longer period is required by law or I become an employee of PTMI.
                      After six (6) months, I may submit a new application to PTMI by contacting{" "}
                      <a href="mailto:ptmirecop@mattel.com" className="underline underline-offset-2">
                        ptmirecop@mattel.com
                      </a>
                      .
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Saya memahami bahwa data pribadi saya akan disimpan paling lama enam (6)
                      bulan setelah proses rekrutmen untuk posisi terkait berakhir, kecuali apabila
                      jangka waktu yang lebih lama diwajibkan oleh hukum atau saya menjadi karyawan
                      PTMI. Setelah enam (6) bulan, saya dapat mengajukan lamaran baru ke PTMI
                      melalui{" "}
                      <a href="mailto:ptmirecop@mattel.com" className="underline underline-offset-2">
                        ptmirecop@mattel.com
                      </a>
                      .
                    </p>
                    <CheckboxField
                      id="Consent_Data_Retention"
                      label="I Agree / Saya Setuju"
                      checked={form.Consent_Data_Retention}
                      onChange={(v) => updateField("Consent_Data_Retention", v)}
                    />
                  </div>
                </div>
              </div>

              <Field label="Applied position" htmlFor="Applied_Position_Display">
                <Input id="Applied_Position_Display" value={job.Job_Title} disabled />
              </Field>

              {/* --------------------------------------------------------- */}
              <SectionHeader title="Upload Documents" />
              <div className="rounded-lg border bg-muted/20 p-5 space-y-6">
                <div>
                  <Label htmlFor="Resume_Input" className="text-sm font-semibold">
                    Resume / Curriculum Vitae <span className="text-destructive">*</span>
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Upload your resume first. We'll automatically extract information and fill in
                    the application form for you. Please review the information before submitting.
                  </p>
                  <ul className="mt-2 ml-5 list-disc text-xs text-muted-foreground">
                    <li>Name</li>
                    <li>Email &amp; Phone Number</li>
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

                <div className="border-t pt-6">
                  <Label htmlFor="KTP_Input" className="text-sm font-semibold">
                    Indonesian Identity Card (KTP)
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Upload your Indonesian Identity Card (KTP).
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
                    onChange={(e) => handleKtpUpload(e.target.files?.[0] ?? null)}
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

              {/* --------------------------------------------------------- */}
              <SectionHeader title="Personal Information" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nama depan (First name)" htmlFor="First_Name" required>
                  <Input id="First_Name" value={form.First_Name} onChange={(e) => updateField("First_Name", e.target.value)} required />
                </Field>
                <Field label="Nama belakang (Last name)" htmlFor="Last_Name" required>
                  <Input id="Last_Name" value={form.Last_Name} onChange={(e) => updateField("Last_Name", e.target.value)} required />
                </Field>
                <Field label="Gender" htmlFor="Gender">
                  <SelectField id="Gender" value={form.Gender} onChange={(v) => updateField("Gender", v)} options={GENDER_OPTIONS} />
                </Field>
                <Field label="Usia (Age)" htmlFor="Age">
                  <Input id="Age" type="number" min={0} value={form.Age} onChange={(e) => updateField("Age", e.target.value)} />
                </Field>
                <Field label="Place of Birth" htmlFor="Place_Of_Birth">
                  <Input id="Place_Of_Birth" value={form.Place_Of_Birth} onChange={(e) => updateField("Place_Of_Birth", e.target.value)} />
                </Field>
                <Field label="Date of Birth" htmlFor="Date_Of_Birth">
                  <Input id="Date_Of_Birth" type="date" value={form.Date_Of_Birth} onChange={(e) => updateField("Date_Of_Birth", e.target.value)} />
                </Field>
                <Field label="Marital Status" htmlFor="Marital_Status">
                  <SelectField id="Marital_Status" value={form.Marital_Status} onChange={(v) => updateField("Marital_Status", v)} options={MARITAL_STATUS_OPTIONS} />
                </Field>
                <Field label="Religion (for religion allowance)" htmlFor="Religion">
                  <SelectField id="Religion" value={form.Religion} onChange={(v) => updateField("Religion", v)} options={RELIGION_OPTIONS} />
                </Field>
              </div>

              {form.Marital_Status === "Married / Menikah" && (
                <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                  <p className="text-sm font-semibold">Spouse (Pasangan)</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Spouse's Name / Nama Pasangan" htmlFor="Spouse_Name">
                      <Input id="Spouse_Name" value={form.Spouse_Name} onChange={(e) => updateField("Spouse_Name", e.target.value)} />
                    </Field>
                    <Field label="Spouse's Date of Birth / Tanggal Lahir Pasangan" htmlFor="Spouse_Date_Of_Birth">
                      <Input id="Spouse_Date_Of_Birth" type="date" value={form.Spouse_Date_Of_Birth} onChange={(e) => updateField("Spouse_Date_Of_Birth", e.target.value)} />
                    </Field>
                    <Field label="Spouse's Gender / Jenis Kelamin Pasangan" htmlFor="Spouse_Gender">
                      <SelectField id="Spouse_Gender" value={form.Spouse_Gender} onChange={(v) => updateField("Spouse_Gender", v)} options={GENDER_OPTIONS} />
                    </Field>
                    <Field label="Spouse's Education / Pendidikan Terakhir Pasangan" htmlFor="Spouse_Education">
                      <SelectField id="Spouse_Education" value={form.Spouse_Education} onChange={(v) => updateField("Spouse_Education", v)} options={EDUCATION_LEVELS} />
                    </Field>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">
                        Children / Anak {form.Children.length > 0 && `(${form.Children.length})`}
                      </p>
                      <Button type="button" variant="outline" size="sm" onClick={addChild}>
                        + Add Child
                      </Button>
                    </div>
                    {form.Children.map((child, idx) => (
                      <div key={child.id} className="mt-3 grid gap-4 rounded-md border bg-background p-3 sm:grid-cols-2">
                        <div className="flex items-center justify-between sm:col-span-2">
                          <p className="text-xs font-medium text-muted-foreground">Child ({idx + 1})</p>
                          <button
                            type="button"
                            onClick={() => removeChild(child.id)}
                            className="text-xs text-destructive underline underline-offset-2"
                          >
                            Remove
                          </button>
                        </div>
                        <Field label="Child's Name / Nama Anak" htmlFor={`child-name-${child.id}`}>
                          <Input id={`child-name-${child.id}`} value={child.Child_Name} onChange={(e) => updateChild(child.id, "Child_Name", e.target.value)} />
                        </Field>
                        <Field label="Child's Gender / Jenis Kelamin Anak" htmlFor={`child-gender-${child.id}`}>
                          <SelectField id={`child-gender-${child.id}`} value={child.Child_Gender} onChange={(v) => updateChild(child.id, "Child_Gender", v)} options={GENDER_OPTIONS} />
                        </Field>
                        <Field label="Child's Date of Birth / Tanggal Lahir Anak" htmlFor={`child-dob-${child.id}`}>
                          <Input id={`child-dob-${child.id}`} type="date" value={child.Child_Date_Of_Birth} onChange={(e) => updateChild(child.id, "Child_Date_Of_Birth", e.target.value)} />
                        </Field>
                        <Field label="Child's Education / Pendidikan Terakhir Anak" htmlFor={`child-edu-${child.id}`}>
                          <SelectField id={`child-edu-${child.id}`} value={child.Child_Education} onChange={(v) => updateChild(child.id, "Child_Education", v)} options={EDUCATION_LEVELS} />
                        </Field>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* --------------------------------------------------------- */}
              <SectionHeader title="Address as Stated on Identity Card (KTP)" />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Address as stated in Identity Card" htmlFor="KTP_Address" hint="alamat lengkap">
                    <Textarea id="KTP_Address" value={form.KTP_Address} onChange={(e) => updateField("KTP_Address", e.target.value)} rows={2} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="RT" htmlFor="RT">
                    <Input id="RT" value={form.RT} onChange={(e) => updateField("RT", e.target.value)} />
                  </Field>
                  <Field label="RW" htmlFor="RW">
                    <Input id="RW" value={form.RW} onChange={(e) => updateField("RW", e.target.value)} />
                  </Field>
                </div>
                <Field label="Kelurahan (Urban Village)" htmlFor="Kelurahan">
                  <Input id="Kelurahan" value={form.Kelurahan} onChange={(e) => updateField("Kelurahan", e.target.value)} />
                </Field>
                <Field label="Kecamatan (Sub-District)" htmlFor="Kecamatan">
                  <Input id="Kecamatan" value={form.Kecamatan} onChange={(e) => updateField("Kecamatan", e.target.value)} />
                </Field>
                <Field label="Kota / Kabupaten (City / Regency)" htmlFor="Kota_Kabupaten" required>
                  <SelectField id="Kota_Kabupaten" value={form.Kota_Kabupaten} onChange={(v) => updateField("Kota_Kabupaten", v)} options={INDONESIAN_CITIES} placeholder="Select a city…" />
                </Field>
                <Field label="Provinsi (Province)" htmlFor="Provinsi">
                  <Input id="Provinsi" value={form.Provinsi} onChange={(e) => updateField("Provinsi", e.target.value)} />
                </Field>
                <Field label="Zip Code" htmlFor="Zip_Code">
                  <Input id="Zip_Code" value={form.Zip_Code} onChange={(e) => updateField("Zip_Code", e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <CheckboxField
                    id="Present_Address_Same_As_KTP"
                    label="I live at this address (Saya tinggal di alamat ini)"
                    checked={form.Present_Address_Same_As_KTP}
                    onChange={(v) => updateField("Present_Address_Same_As_KTP", v)}
                  />
                </div>
                {!form.Present_Address_Same_As_KTP && (
                  <div className="sm:col-span-2">
                    <Field label="Present Address" htmlFor="Present_Address" required hint="start typing, then pick a suggestion">
                      <AddressAutocompleteField
                        id="Present_Address"
                        value={form.Present_Address}
                        onChangeText={(v) => updateField("Present_Address", v)}
                        onPlaceSelected={({ city, province, zip }) => {
                          setForm((prev) => ({
                            ...prev,
                            Present_Address_City: city,
                            Present_Address_Province: province,
                            Present_Address_Zip_Code: zip,
                          }));
                        }}
                      />
                    </Field>
                  </div>
                )}
              </div>

              {/* --------------------------------------------------------- */}
              <SectionHeader title="Contact & Identity Numbers" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Mobile phone number (WhatsApp Active)" htmlFor="Mobile_Phone_WA" required>
                  <Input id="Mobile_Phone_WA" value={form.Mobile_Phone_WA} onChange={(e) => updateField("Mobile_Phone_WA", e.target.value)} placeholder="08xx-xxxx-xxxx" required />
                </Field>
                <Field label="Email Address (Active)" htmlFor="email" required>
                  <Input id="email" type="email" value={form.email} onChange={(e) => updateField("email", e.target.value)} required />
                </Field>
                <Field label="Identity Card Number (KTP)" htmlFor="Identity_Card_Number" hint="16 digits">
                  <Input
                    id="Identity_Card_Number"
                    inputMode="numeric"
                    maxLength={16}
                    value={form.Identity_Card_Number}
                    onChange={(e) => updateField("Identity_Card_Number", e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
                <Field label="Family Card Number (KK)" htmlFor="Family_Card_Number">
                  <Input id="Family_Card_Number" inputMode="numeric" value={form.Family_Card_Number} onChange={(e) => updateField("Family_Card_Number", e.target.value.replace(/\D/g, ""))} />
                </Field>
              </div>

              {/* --------------------------------------------------------- */}
              <SectionHeader title="Emergency Contact" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name of emergency contact" htmlFor="Emergency_Contact_Name">
                  <Input id="Emergency_Contact_Name" value={form.Emergency_Contact_Name} onChange={(e) => updateField("Emergency_Contact_Name", e.target.value)} />
                </Field>
                <Field label="Relationship with the emergency contact" htmlFor="Emergency_Contact_Relationship">
                  <Input id="Emergency_Contact_Relationship" value={form.Emergency_Contact_Relationship} onChange={(e) => updateField("Emergency_Contact_Relationship", e.target.value)} />
                </Field>
                <Field label="Phone number of emergency contact (WhatsApp Active)" htmlFor="Emergency_Contact_Phone">
                  <Input id="Emergency_Contact_Phone" value={form.Emergency_Contact_Phone} onChange={(e) => updateField("Emergency_Contact_Phone", e.target.value)} />
                </Field>
                <div className="flex items-end pb-1.5">
                  <CheckboxField
                    id="Emergency_Contact_Address_Same_As_Me"
                    label="Emergency contact address is the same as mine"
                    checked={form.Emergency_Contact_Address_Same_As_Me}
                    onChange={(v) => updateField("Emergency_Contact_Address_Same_As_Me", v)}
                  />
                </div>
                {!form.Emergency_Contact_Address_Same_As_Me && (
                  <>
                    <div className="sm:col-span-2">
                      <Field label="Address of emergency contact" htmlFor="Emergency_Contact_Address">
                        <AddressAutocompleteField
                          id="Emergency_Contact_Address"
                          value={form.Emergency_Contact_Address}
                          onChangeText={(v) => updateField("Emergency_Contact_Address", v)}
                          onPlaceSelected={({ city, province, zip }) => {
                            setForm((prev) => ({
                              ...prev,
                              Emergency_Contact_City: city,
                              Emergency_Contact_Province: province,
                              Emergency_Contact_Zip_Code: zip,
                            }));
                          }}
                        />
                      </Field>
                    </div>
                    <Field label="City / Regency" htmlFor="Emergency_Contact_City" hint="auto-filled">
                      <Input id="Emergency_Contact_City" value={form.Emergency_Contact_City} onChange={(e) => updateField("Emergency_Contact_City", e.target.value)} />
                    </Field>
                    <Field label="Province" htmlFor="Emergency_Contact_Province" hint="auto-filled">
                      <Input id="Emergency_Contact_Province" value={form.Emergency_Contact_Province} onChange={(e) => updateField("Emergency_Contact_Province", e.target.value)} />
                    </Field>
                    <Field label="Zip Code" htmlFor="Emergency_Contact_Zip_Code" hint="auto-filled">
                      <Input id="Emergency_Contact_Zip_Code" value={form.Emergency_Contact_Zip_Code} onChange={(e) => updateField("Emergency_Contact_Zip_Code", e.target.value)} />
                    </Field>
                  </>
                )}
              </div>

              {/* --------------------------------------------------------- */}
              <SectionHeader title="Education" />
              <p className="text-xs text-muted-foreground">
                Tick every level you've completed <span className="text-destructive">*</span> — the
                matching section will appear below for each one.
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-4 sm:grid-cols-5">
                {EDUCATION_LEVEL_CHECKBOXES.map((level) => (
                  <label key={level} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.Education_Levels_Selected.includes(level)}
                      onChange={() => toggleInList("Education_Levels_Selected", level)}
                      className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                    />
                    {level}
                  </label>
                ))}
              </div>

              {form.Education_Levels_Selected.includes("SMA/SMK") && (
                <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                  <Field label="Name of High School or Vocational School" htmlFor="HS_Name">
                    <Input id="HS_Name" value={form.HS_Name} onChange={(e) => updateField("HS_Name", e.target.value)} />
                  </Field>
                  <Field label="Location" htmlFor="HS_Location">
                    <Input id="HS_Location" value={form.HS_Location} onChange={(e) => updateField("HS_Location", e.target.value)} />
                  </Field>
                  <Field label="Major" htmlFor="HS_Major">
                    <Input id="HS_Major" value={form.HS_Major} onChange={(e) => updateField("HS_Major", e.target.value)} />
                  </Field>
                  <Field label="Graduation Year" htmlFor="HS_Graduation_Year">
                    <Input id="HS_Graduation_Year" inputMode="numeric" value={form.HS_Graduation_Year} onChange={(e) => updateField("HS_Graduation_Year", e.target.value)} />
                  </Field>
                </div>
              )}

              {form.Education_Levels_Selected.includes("D3") && (
                <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                  <Field label="Name of College / Academy Institution" htmlFor="Academy_Name">
                    <Input id="Academy_Name" value={form.Academy_Name} onChange={(e) => updateField("Academy_Name", e.target.value)} />
                  </Field>
                  <Field label="Location of College" htmlFor="Academy_Location">
                    <Input id="Academy_Location" value={form.Academy_Location} onChange={(e) => updateField("Academy_Location", e.target.value)} />
                  </Field>
                  <Field label="College Major" htmlFor="Academy_Major">
                    <Input id="Academy_Major" value={form.Academy_Major} onChange={(e) => updateField("Academy_Major", e.target.value)} />
                  </Field>
                  <Field label="College Graduation Year" htmlFor="Academy_Graduation_Year">
                    <Input id="Academy_Graduation_Year" inputMode="numeric" value={form.Academy_Graduation_Year} onChange={(e) => updateField("Academy_Graduation_Year", e.target.value)} />
                  </Field>
                </div>
              )}

              {form.Education_Levels_Selected.includes("S1") && (
                <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                  <Field label="Name of University for Bachelor Degree" htmlFor="Bachelor_University_Name">
                    <Input id="Bachelor_University_Name" value={form.Bachelor_University_Name} onChange={(e) => updateField("Bachelor_University_Name", e.target.value)} />
                  </Field>
                  <Field label="Location of University" htmlFor="Bachelor_Location">
                    <Input id="Bachelor_Location" value={form.Bachelor_Location} onChange={(e) => updateField("Bachelor_Location", e.target.value)} />
                  </Field>
                  <Field label="Major of Bachelor Degree" htmlFor="Bachelor_Major">
                    <Input id="Bachelor_Major" value={form.Bachelor_Major} onChange={(e) => updateField("Bachelor_Major", e.target.value)} />
                  </Field>
                  <Field label="Graduation Year" htmlFor="Bachelor_Graduation_Year">
                    <Input id="Bachelor_Graduation_Year" inputMode="numeric" value={form.Bachelor_Graduation_Year} onChange={(e) => updateField("Bachelor_Graduation_Year", e.target.value)} />
                  </Field>
                </div>
              )}

              {form.Education_Levels_Selected.includes("S2") && (
                <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                  <Field label="Name of University for Master Degree" htmlFor="Master_University_Name">
                    <Input id="Master_University_Name" value={form.Master_University_Name} onChange={(e) => updateField("Master_University_Name", e.target.value)} />
                  </Field>
                  <Field label="Location of University" htmlFor="Master_Location">
                    <Input id="Master_Location" value={form.Master_Location} onChange={(e) => updateField("Master_Location", e.target.value)} />
                  </Field>
                  <Field label="Major of Master Degree" htmlFor="Master_Major">
                    <Input id="Master_Major" value={form.Master_Major} onChange={(e) => updateField("Master_Major", e.target.value)} />
                  </Field>
                  <Field label="Graduation Year" htmlFor="Master_Graduation_Year">
                    <Input id="Master_Graduation_Year" inputMode="numeric" value={form.Master_Graduation_Year} onChange={(e) => updateField("Master_Graduation_Year", e.target.value)} />
                  </Field>
                </div>
              )}

              {form.Education_Levels_Selected.includes("S3") && (
                <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                  <Field label="Name of University for Doctorate Degree" htmlFor="Doctorate_University_Name">
                    <Input id="Doctorate_University_Name" value={form.Doctorate_University_Name} onChange={(e) => updateField("Doctorate_University_Name", e.target.value)} />
                  </Field>
                  <Field label="Location of University" htmlFor="Doctorate_Location">
                    <Input id="Doctorate_Location" value={form.Doctorate_Location} onChange={(e) => updateField("Doctorate_Location", e.target.value)} />
                  </Field>
                  <Field label="Major of Doctorate Degree" htmlFor="Doctorate_Major">
                    <Input id="Doctorate_Major" value={form.Doctorate_Major} onChange={(e) => updateField("Doctorate_Major", e.target.value)} />
                  </Field>
                  <Field label="Graduation Year" htmlFor="Doctorate_Graduation_Year">
                    <Input id="Doctorate_Graduation_Year" inputMode="numeric" value={form.Doctorate_Graduation_Year} onChange={(e) => updateField("Doctorate_Graduation_Year", e.target.value)} />
                  </Field>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nama sekolah/universitas (School, general)" htmlFor="School" hint="used for CV matching">
                  <Input id="School" value={form.School} onChange={(e) => updateField("School", e.target.value)} />
                </Field>
              </div>

              {/* --------------------------------------------------------- */}
              <SectionHeader title="Certificates" />
              <div className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                {CERTIFICATE_OPTIONS.map((cert) => (
                  <label key={cert} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.certificatesSelected.includes(cert)}
                      onChange={() => toggleInList("certificatesSelected", cert)}
                      className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                    />
                    {cert}
                  </label>
                ))}
              </div>
              <Input
                value={form.certificatesOther}
                onChange={(e) => updateField("certificatesOther", e.target.value)}
                placeholder="Other certificates"
              />

              {/* --------------------------------------------------------- */}
              <SectionHeader title="Skills" />
              <div className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                {SKILL_OPTIONS.map((skill) => (
                  <label key={skill} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.skillsSelected.includes(skill)}
                      onChange={() => toggleInList("skillsSelected", skill)}
                      className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                    />
                    {skill}
                  </label>
                ))}
              </div>
              <Input
                value={form.skillsOther}
                onChange={(e) => updateField("skillsOther", e.target.value)}
                placeholder="Other skills"
              />

              {/* --------------------------------------------------------- */}
              <SectionHeader title="Language Skills" />
              <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                {LANGUAGE_OPTIONS.map((language) => {
                  const selected = form.languageSkills.find((l) => l.language === language);
                  return (
                    <div key={language} className="flex flex-wrap items-center gap-3">
                      <label className="flex w-48 cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!selected}
                          onChange={() => toggleLanguage(language)}
                          className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                        />
                        {language}
                      </label>
                      {selected && (
                        <SelectField
                          id={`lang-${language}`}
                          value={selected.proficiency}
                          onChange={(v) => setLanguageProficiency(language, v)}
                          options={LANGUAGE_PROFICIENCY_OPTIONS}
                          className="max-w-[220px]"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* --------------------------------------------------------- */}
              <SectionHeader title="The Latest Employment History (Riwayat Pekerjaan Terakhir)" />
              <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                <Field label="Company Name / Nama Perusahaan" htmlFor="Company_Name_1">
                  <Input id="Company_Name_1" value={form.Company_Name_1} onChange={(e) => updateField("Company_Name_1", e.target.value)} />
                </Field>
                <Field label="Last Position / Jabatan Terakhir" htmlFor="Last_Position_1">
                  <Input id="Last_Position_1" value={form.Last_Position_1} onChange={(e) => updateField("Last_Position_1", e.target.value)} />
                </Field>
                <Field label="Business Type / Bidang Usaha" htmlFor="Business_Type_1">
                  <Input id="Business_Type_1" value={form.Business_Type_1} onChange={(e) => updateField("Business_Type_1", e.target.value)} />
                </Field>
                <Field label="Recent Gross Monthly Salary" htmlFor="Recent_Gross_Monthly_Salary_1">
                  <Input id="Recent_Gross_Monthly_Salary_1" inputMode="numeric" value={form.Recent_Gross_Monthly_Salary_1} onChange={(e) => updateField("Recent_Gross_Monthly_Salary_1", e.target.value)} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Job Description / Uraikan tugas Anda" htmlFor="Job_Description_1">
                    <Textarea id="Job_Description_1" rows={3} value={form.Job_Description_1} onChange={(e) => updateField("Job_Description_1", e.target.value)} />
                  </Field>
                </div>
                <Field label="Start Date / Tanggal Mulai" htmlFor="Start_Date_1">
                  <Input id="Start_Date_1" type="date" value={form.Start_Date_1} onChange={(e) => updateField("Start_Date_1", e.target.value)} />
                </Field>
                <div className="flex items-end pb-1.5">
                  <CheckboxField
                    id="Still_Working_1"
                    label="Still working here? / Masih bekerja di sini?"
                    checked={form.Still_Working_1}
                    onChange={(v) => updateField("Still_Working_1", v)}
                  />
                </div>
                {!form.Still_Working_1 && (
                  <>
                    <Field label="Finish Date / Tanggal Selesai" htmlFor="Finish_Date_1">
                      <Input id="Finish_Date_1" type="date" value={form.Finish_Date_1} onChange={(e) => updateField("Finish_Date_1", e.target.value)} />
                    </Field>
                    <Field label="Reason For Leaving / Alasan Berhenti" htmlFor="Reason_For_Leaving_1">
                      <Input id="Reason_For_Leaving_1" value={form.Reason_For_Leaving_1} onChange={(e) => updateField("Reason_For_Leaving_1", e.target.value)} />
                    </Field>
                  </>
                )}
                <Field label="Employer / Supervisor Name" htmlFor="Employer_Supervisor_Name_1">
                  <Input id="Employer_Supervisor_Name_1" value={form.Employer_Supervisor_Name_1} onChange={(e) => updateField("Employer_Supervisor_Name_1", e.target.value)} />
                </Field>
                <Field label="Employer / Supervisor Position" htmlFor="Employer_Supervisor_Position_1">
                  <Input id="Employer_Supervisor_Position_1" value={form.Employer_Supervisor_Position_1} onChange={(e) => updateField("Employer_Supervisor_Position_1", e.target.value)} />
                </Field>
                <Field label="Employer / Supervisor Phone" htmlFor="Employer_Supervisor_Phone_1">
                  <Input id="Employer_Supervisor_Phone_1" value={form.Employer_Supervisor_Phone_1} onChange={(e) => updateField("Employer_Supervisor_Phone_1", e.target.value)} />
                </Field>
                <Field label="Period Known of Employer / Supervisor" htmlFor="Period_Known_Of_Employer_1">
                  <Input id="Period_Known_Of_Employer_1" value={form.Period_Known_Of_Employer_1} onChange={(e) => updateField("Period_Known_Of_Employer_1", e.target.value)} />
                </Field>
              </div>

              {/* --------------------------------------------------------- */}
              <SectionHeader title="Application History" />
              <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                <Field label="Have you previously applied to our company before?" htmlFor="Previously_Applied">
                  <SelectField id="Previously_Applied" value={form.Previously_Applied} onChange={(v) => updateField("Previously_Applied", v)} options={YES_NO} />
                </Field>
                {form.Previously_Applied === "Yes" && (
                  <>
                    <Field label="If yes, when did you apply?" htmlFor="Previous_Application_Date">
                      <Input id="Previous_Application_Date" type="date" value={form.Previous_Application_Date} onChange={(e) => updateField("Previous_Application_Date", e.target.value)} />
                    </Field>
                    <Field label="What position have you applied before?" htmlFor="Previous_Position_Applied">
                      <Input id="Previous_Position_Applied" value={form.Previous_Position_Applied} onChange={(e) => updateField("Previous_Position_Applied", e.target.value)} />
                    </Field>
                  </>
                )}
                <Field label="Any objection if we contact your previous employer for reference checking?" htmlFor="Objection_To_Reference_Check">
                  <SelectField id="Objection_To_Reference_Check" value={form.Objection_To_Reference_Check} onChange={(v) => updateField("Objection_To_Reference_Check", v)} options={YES_NO} />
                </Field>
                <Field label="Do you have any acquaintance working at Mattel?" htmlFor="Acquaintance_At_Mattel">
                  <SelectField id="Acquaintance_At_Mattel" value={form.Acquaintance_At_Mattel} onChange={(v) => updateField("Acquaintance_At_Mattel", v)} options={YES_NO} />
                </Field>
                {form.Acquaintance_At_Mattel === "Yes" && (
                  <>
                    <Field label="Please mention your acquaintance's / relative's name" htmlFor="Acquaintance_Name">
                      <Input id="Acquaintance_Name" value={form.Acquaintance_Name} onChange={(e) => updateField("Acquaintance_Name", e.target.value)} />
                    </Field>
                    <Field label="Please mention your relationship" htmlFor="Acquaintance_Relationship">
                      <SelectField id="Acquaintance_Relationship" value={form.Acquaintance_Relationship} onChange={(v) => updateField("Acquaintance_Relationship", v)} options={ACQUAINTANCE_RELATIONSHIP_OPTIONS} />
                    </Field>
                  </>
                )}
              </div>

              {/* --------------------------------------------------------- */}
              <SectionHeader title="Offer Details" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="What is your expected gross monthly salary?" htmlFor="Expected_Gross_Monthly_Salary">
                  <Input id="Expected_Gross_Monthly_Salary" inputMode="numeric" value={form.Expected_Gross_Monthly_Salary} onChange={(e) => updateField("Expected_Gross_Monthly_Salary", e.target.value)} />
                </Field>
                <Field label="If offered, when would you be available to start work?" htmlFor="Available_Start_Date">
                  <Input id="Available_Start_Date" type="date" value={form.Available_Start_Date} onChange={(e) => updateField("Available_Start_Date", e.target.value)} />
                </Field>
                <Field label="Uniform Size" htmlFor="Uniform_Size">
                  <SelectField id="Uniform_Size" value={form.Uniform_Size} onChange={(v) => updateField("Uniform_Size", v)} options={UNIFORM_SIZES} />
                </Field>
                <Field label="Periode pemberitahuan (Notice period)" htmlFor="Notice_Period">
                  <Input id="Notice_Period" value={form.Notice_Period} onChange={(e) => updateField("Notice_Period", e.target.value)} placeholder="e.g. 1 month, Immediate" />
                </Field>
                <Field label="Pengalaman kerja (Years of experience)" htmlFor="ExperienceYears">
                  <div className="flex items-center gap-2">
                    <Input id="ExperienceYears" type="number" min={0} step={1} value={form.ExperienceYears} onChange={(e) => updateField("ExperienceYears", e.target.value)} placeholder="0" className="max-w-[120px]" />
                    <span className="text-sm text-muted-foreground">tahun (years)</span>
                  </div>
                </Field>
              </div>

              {/* --------------------------------------------------------- */}
              <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                <CheckboxField id="Is_18_Plus" label="Saya berusia 18 tahun ke atas (I am 18 years or older) *" checked={form.Is_18_Plus} onChange={(v) => updateField("Is_18_Plus", v)} />
                <CheckboxField id="Legal_Right_To_Work" label="Saya memiliki hak izin kerja yang sah (I have legal right to work) *" checked={form.Legal_Right_To_Work} onChange={(v) => updateField("Legal_Right_To_Work", v)} />
                <CheckboxField id="Former_Current_Mattel_Employee" label="Saya pernah/sedang menjadi karyawan Mattel (Former/current Mattel employee)" checked={form.Former_Current_Mattel_Employee} onChange={(v) => updateField("Former_Current_Mattel_Employee", v)} />
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

const SectionHeader: FC<{ title: string }> = ({ title }) => (
  <h3 className="border-t pt-5 text-base font-semibold first:border-t-0 first:pt-0">{title}</h3>
);

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

const SelectField: FC<{
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}> = ({ id, value, onChange, options, placeholder = "Select…", className }) => (
  <select
    id={id}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className ?? ""}`}
  >
    <option value="" disabled>
      {placeholder}
    </option>
    {options.map((opt) => (
      <option key={opt} value={opt}>
        {opt}
      </option>
    ))}
  </select>
);