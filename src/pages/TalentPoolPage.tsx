import { type FC, useEffect, useState, useMemo } from "react";
import { Users2, Search, Mail, Phone, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { CandidateRecord } from "@/lib/candidateBoard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageWrapper, PageSection } from "@/components/PageWrapper";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const TalentPoolPage: FC = () => {
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const loadRejected = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase
          .from("candidates")
          .select("*")
          .eq("status", "Rejected")
          .order("applied_at", { ascending: false });

        if (error) throw error;
        setCandidates(data ?? []);
      } catch (err) {
        console.error("Failed to load rejected candidates", err);
        setError("Couldn't load rejected candidates from the talent pool.");
      } finally {
        setLoading(false);
      }
    };

    loadRejected();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const fullName = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
      return (
        fullName.includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.applied_position || "").toLowerCase().includes(q) ||
        (c.city || "").toLowerCase().includes(q)
      );
    });
  }, [candidates, search]);

  const statusClass = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s.includes("reject")) return "bg-red-500/10 text-red-600 dark:text-red-400";
    if (s.includes("hire") || s.includes("offer")) return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    if (s.includes("interview")) return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="min-h-screen bg-background">
      <PageWrapper className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <PageSection index={0} className="mb-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Talent Pool</h1>
            <p className="text-muted-foreground">
              Rejected candidates who may be suitable for future roles
            </p>
          </div>
        </PageSection>

        <PageSection index={1}>
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, position, city..."
                  className="pl-9"
                />
              </div>
            </CardContent>
          </Card>
        </PageSection>

        {error && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <PageSection index={2}>
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex h-64 items-center justify-center text-muted-foreground">
                  <Users2 className="h-8 w-8 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center text-muted-foreground">
                  <Users2 className="h-12 w-12 mb-3 opacity-50" />
                  <p className="text-sm">
                    {candidates.length === 0
                      ? "No rejected candidates in the talent pool yet."
                      : "No candidates match your search."}
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {filtered.map((c) => (
                    <div key={c.id} className="flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium truncate">{c.first_name} {c.last_name}</h3>
                          <Badge className={cn("shrink-0 border-0 text-[10px]", statusClass(c.status))}>
                            {c.status}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5" />
                            <span className="truncate">{c.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5" />
                            <span className="truncate">{c.phone_number}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3.5 w-3.5" />
                            <span className="truncate">{c.city}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users2 className="h-3.5 w-3.5" />
                            <span className="truncate">{c.applied_position}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button size="sm" variant="outline">
                          View Profile
                        </Button>
                        <Button size="sm" variant="outline">
                          Contact
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </PageSection>
      </PageWrapper>
    </div>
  );
};

export default TalentPoolPage;
