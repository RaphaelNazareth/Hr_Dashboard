import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Bot,
  Send,
  Sparkles,
  Users,
  LayoutDashboard,
  FileText,
  CalendarClock,
  Minus,
  X,
  ArrowRight,
  FileDown,
  CalendarCheck,
  AlertTriangle,
} from 'lucide-react';
import { useEffect, useRef, useState, type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Point this at wherever your FastAPI backend is actually running.
// In Vite, set VITE_API_URL in your .env to override for staging/prod.
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

// Compact markdown -> Tailwind mapping so headings/lists/bold from the
// backend's replies (e.g. "**Candidate ID:** CAND-12345") render properly
// inside a small chat bubble instead of showing raw asterisks/hashes.
const markdownComponents = {
  p: ({ children }: any) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: any) => <em className="italic">{children}</em>,
  h1: ({ children }: any) => <h1 className="text-sm font-bold mb-1.5 mt-2 first:mt-0">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-sm font-bold mb-1.5 mt-2 first:mt-0">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-sm font-semibold mb-1 mt-1.5 first:mt-0">{children}</h3>,
  ul: ({ children }: any) => <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-0.5">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-0.5">{children}</ol>,
  li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
  a: ({ children, href }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary">
      {children}
    </a>
  ),
  code: ({ children }: any) => (
    <code className="rounded bg-black/10 px-1 py-0.5 text-[0.8em] font-mono">{children}</code>
  ),
  table: ({ children }: any) => (
    <div className="overflow-x-auto mb-2 last:mb-0">
      <table className="min-w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }: any) => <th className="border border-border/60 px-2 py-1 text-left font-semibold bg-black/5">{children}</th>,
  td: ({ children }: any) => <td className="border border-border/60 px-2 py-1">{children}</td>,
  hr: () => <hr className="my-2 border-border/60" />,
};

interface UIAction {
  type: 'navigate' | 'open_resume' | 'compare' | 'schedule_interview';
  label: string;
  payload: Record<string, any>;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: UIAction[];
  isError?: boolean;
}

interface ChatResponse {
  reply: string;
  actions: UIAction[];
  tool_trace: Array<{ tool: string; arguments: Record<string, any>; result_preview: unknown }>;
  model_used: string;
}

interface AIAssistantWidgetProps {
  userName?: string;
}

const SUGGESTIONS = [
  { label: 'Find applicants', icon: Users, prompt: 'Help me find applicants for an open role' },
  { label: 'Explain dashboard', icon: LayoutDashboard, prompt: 'Explain what this dashboard shows' },
  { label: 'Generate JD', icon: FileText, prompt: 'Generate a job description' },
  { label: 'Schedule interview', icon: CalendarClock, prompt: 'Help me schedule an interview' },
];

export const AIAssistantWidget: FC<AIAssistantWidgetProps> = ({ userName = 'there' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleOpen = () => {
    setTooltipOpen(false);
    setIsOpen(true);
  };

  // Talks to the FastAPI /chat endpoint. Sends prior turns as `history` so
  // the agent has conversational context (e.g. "summarize him" after a
  // search referring to a previous result).
  const callBackend = async (message: string, priorMessages: Message[]): Promise<ChatResponse> => {
    const history = priorMessages
      .filter((m) => !m.isError)
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      throw new Error(detail?.detail ?? `Request failed (${res.status})`);
    }

    return res.json();
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: trimmed };
    const priorMessages = messages;
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    try {
      const data = await callBackend(trimmed, priorMessages);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: data.reply, actions: data.actions },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            err instanceof Error
              ? `Something went wrong reaching the assistant: ${err.message}`
              : 'Something went wrong reaching the assistant.',
          isError: true,
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  // The AI only ever *suggests* these actions — clicking is what actually
  // performs them, kept entirely on the frontend's terms.
  const handleAction = (action: UIAction) => {
    switch (action.type) {
      case 'navigate':
        navigate(`/${action.payload.page}`);
        setIsOpen(false);
        break;
      case 'open_resume':
        window.open(action.payload.url, '_blank', 'noopener,noreferrer');
        break;
      case 'schedule_interview':
        navigate('/help-desk?tab=tickets');
        break;
      case 'compare':
        navigate('/candidates?compare=' + (action.payload.ids ?? []).join(','));
        break;
    }
  };

  const actionIcon = (type: UIAction['type']) => {
    switch (type) {
      case 'navigate':
        return ArrowRight;
      case 'open_resume':
        return FileDown;
      case 'schedule_interview':
        return CalendarCheck;
      default:
        return ArrowRight;
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Chat Panel */}
      {isOpen && (
        <div className="w-[380px] max-w-[calc(100vw-3rem)] rounded-2xl border border-border bg-background shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
            <div className="flex items-center gap-2">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
                <Bot size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">HR Assistant</p>
                <p className="text-[11px] text-primary-foreground/80 mt-0.5">Online</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
                onClick={() => setIsOpen(false)}
              >
                <Minus size={16} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
                onClick={() => {
                  setIsOpen(false);
                  setMessages([]);
                }}
              >
                <X size={16} />
              </Button>
            </div>
          </div>

          {/* Body */}
          <div ref={scrollRef} className="flex-1 max-h-[420px] min-h-[280px] overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <>
                <div className="rounded-xl bg-muted px-3 py-2 text-sm w-fit max-w-[85%]">
                  👋 Hi {userName}, how can I help today?
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground px-0.5">Suggested</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SUGGESTIONS.map(({ label, icon: Icon, prompt }) => (
                      <button
                        key={label}
                        onClick={() => send(prompt)}
                        className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-left text-xs font-medium hover:bg-accent hover:border-primary/40 transition-colors"
                      >
                        <Icon size={14} className="text-primary shrink-0" />
                        <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} gap-1.5`}>
                <div
                  className={`rounded-xl px-3 py-2 text-sm max-w-[85%] flex items-start gap-1.5 ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground whitespace-pre-wrap'
                      : m.isError
                        ? 'bg-red-50 text-red-900 border border-red-200 whitespace-pre-wrap'
                        : 'bg-muted text-foreground'
                  }`}
                >
                  {m.isError && <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-500" />}
                  {m.role === 'assistant' && !m.isError ? (
                    <div className="min-w-0 flex-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <span>{m.content}</span>
                  )}
                </div>

                {/* Suggested UI actions returned by the backend — the AI
                    proposes, the user clicks, the frontend performs them. */}
                {m.actions && m.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 max-w-[85%]">
                    {m.actions.map((action, i) => {
                      const Icon = actionIcon(action.type);
                      return (
                        <button
                          key={i}
                          onClick={() => handleAction(action)}
                          className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                        >
                          {action.label}
                          <Icon size={12} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {isThinking && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-muted px-3 py-2 text-sm flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border px-3 py-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              disabled={isThinking}
            />
            <Button
              type="submit"
              size="icon"
              className="h-8 w-8 rounded-full shrink-0"
              disabled={!input.trim() || isThinking}
            >
              <Send size={14} />
            </Button>
          </form>
        </div>
      )}

      {/* Floating Avatar Button */}
      {!isOpen && (
        <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
          <TooltipTrigger asChild>
            <button
              onClick={handleOpen}
              className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:scale-105"
            >
              {/* Glow ring */}
              <span className="absolute inset-0 rounded-full bg-primary/40 blur-md animate-pulse" />
              <Bot size={24} className="relative" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-background">
                <Sparkles size={9} className="text-white" />
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Ask HR Assistant</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};