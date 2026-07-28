import { useEffect, useState, type FC } from 'react';
import { Link } from 'react-router-dom';
import PocketBase from 'pocketbase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { useWaveAnimation } from '@/hooks/useWaveAnimation';

const pb = new PocketBase(
  import.meta.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090'
);
pb.autoCancellation(false);

const TRACKING_COLLECTION = 'Candidate_Tracking';
const DISPLAY_LIMIT = 3;

interface TrackingEntry {
  id: string;
  candidate_id: string;
  Applied_Position: string;
  Stage: string;
  Date: string;
  Notes: string;
  created: string;
  expand?: {
    candidate_id?: {
      id: string;
      First_Name: string;
      Last_Name: string;
    };
  };
}

// Maps a stage name to an emoji + short verb so the feed reads like a kudos
// wall rather than a raw status log. Falls back to a generic "moved to"
// line for any stage not explicitly listed here.
function getStageFlavor(stage: string): { emoji: string; verb: string } {
  const s = stage.toLowerCase();

  if (s.includes('hired')) return { emoji: '🏆', verb: 'was hired for' };
  if (s.includes('reject')) return { emoji: '👋', verb: 'was not moving forward in' };
  if (s.includes('offering') || s.includes('offer')) return { emoji: '🎁', verb: 'received an offer for' };
  if (s.includes('mcu')) return { emoji: '🩺', verb: 'completed a medical checkup for' };
  if (s.includes('interview')) return { emoji: '🎤', verb: `reached ${stage} for` };
  if (s.includes('fgd')) return { emoji: '👥', verb: 'joined the FGD for' };
  if (s.includes('psychotest')) return { emoji: '🧠', verb: 'took the psychotest for' };
  if (s.includes('phone')) return { emoji: '📞', verb: 'completed phone screening for' };
  if (s.includes('cv') || s.includes('screening')) return { emoji: '📄', verb: 'passed CV screening for' };
  if (s.includes('applied')) return { emoji: '✨', verb: 'applied for' };

  return { emoji: '📌', verb: `moved to ${stage} for` };
}

function getStageBadgeClass(stage: string) {
  const s = stage.toLowerCase();
  if (s.includes('hired'))
    return 'border-emerald-600 bg-emerald-50 text-emerald-700 dark:border-emerald-300 dark:bg-emerald-100 dark:text-emerald-800';
  if (s.includes('reject'))
    return 'border-red-600 bg-red-50 text-red-700 dark:border-red-300 dark:bg-red-100 dark:text-red-800';
  if (s.includes('interview'))
    return 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-300 dark:bg-blue-100 dark:text-blue-800';
  if (s.includes('offer'))
    return 'border-amber-600 bg-amber-50 text-amber-700 dark:border-amber-300 dark:bg-amber-100 dark:text-amber-800';
  return 'border-purple-600 bg-purple-50 text-purple-700 dark:border-purple-300 dark:bg-purple-100 dark:text-purple-800';
}

function formatRelativeTime(iso: string) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const diffMin = Math.round(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const RecentActivity: FC = () => {
  const { containerRef, getItemStyle, getItemClassName } = useWaveAnimation();

  const [entries, setEntries] = useState<TrackingEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await pb
          .collection(TRACKING_COLLECTION)
          .getList<TrackingEntry>(1, DISPLAY_LIMIT, {
            sort: '-Date',
            expand: 'candidate_id',
          });
        if (!cancelled) {
          setEntries(result.items);
          setTotalCount(result.totalItems);
        }
      } catch (err) {
        console.error('Failed to load recent activity', err);
        if (!cancelled) setError("Couldn't load recent activity.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between space-y-2 sm:space-y-0 pb-2">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>
            Candidates moving through the pipeline
          </CardDescription>
        </div>
        <Link to="/recruitment-pipeline" className="w-full sm:w-auto">
          <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto">
            View All
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardHeader>

      <CardContent ref={containerRef}>
        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!loading && error && (
          <p className="py-6 text-center text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && entries.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No activity yet. Move a candidate through a stage to see it here.
          </p>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="space-y-3">
            {entries.map((entry, index) => {
              const candidate = entry.expand?.candidate_id;
              const name = candidate
                ? `${candidate.First_Name} ${candidate.Last_Name}`.trim()
                : 'A candidate';
              const { emoji, verb } = getStageFlavor(entry.Stage);

              const content = (
                <div
                  key={entry.id}
                  className={getItemClassName(
                    'p-3 rounded-lg border bg-muted/30 border-border hover:bg-muted/50 transition-colors'
                  )}
                  style={getItemStyle(index)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-lg leading-none">{emoji}</div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm leading-snug">
                          <span className="font-medium">{name}</span>{' '}
                          <span className="text-muted-foreground">{verb}</span>{' '}
                          {entry.Applied_Position && (
                            <span className="font-medium">{entry.Applied_Position}</span>
                          )}
                        </p>
                        <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                          {formatRelativeTime(entry.Date || entry.created)}
                        </span>
                      </div>
                      {entry.Notes && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {entry.Notes}
                        </p>
                      )}
                      <Badge variant="outline" className={getStageBadgeClass(entry.Stage)}>
                        {entry.Stage}
                      </Badge>
                    </div>
                  </div>
                </div>
              );

              return candidate ? (
                <Link key={entry.id} to={`/profiles?candidateId=${candidate.id}`} className="block">
                  {content}
                </Link>
              ) : (
                content
              );
            })}
          </div>
        )}

        {/* Summary */}
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-muted-foreground text-center">
            Showing {entries.length} of {totalCount} recent updates
          </p>

          {totalCount > DISPLAY_LIMIT && (
            <div className="mt-2">
              <Link to="/recruitment-pipeline">
                <Button variant="ghost" size="sm" className="w-full gap-2 text-muted-foreground hover:text-foreground">
                  <span>
                    View {totalCount - DISPLAY_LIMIT} more{' '}
                    {totalCount - DISPLAY_LIMIT === 1 ? 'update' : 'updates'}
                  </span>
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};