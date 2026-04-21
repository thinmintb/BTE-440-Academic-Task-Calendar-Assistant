import { useEffect, useLayoutEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';

interface TourStep {
  target?: string; // data-tour key; when omitted, the step renders centered without a spotlight
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    title: 'Welcome!',
    body: 'Take the 60-second tour of your AI Academic Assistant — or skip and explore.',
  },
  {
    target: 'weekly-agenda',
    title: 'Your week, summarized',
    body: 'Gemini writes a fresh 2-3 sentence briefing here every week, plus event/hour stats.',
  },
  {
    target: 'calendar',
    title: 'Calendar + workload heatmap',
    body: 'See your month at a glance. The color strip underneath shows how loaded each day is.',
  },
  {
    target: 'pdf-import',
    title: 'Drop in a syllabus',
    body: 'Upload a PDF and the app extracts every deadline automatically.',
  },
  {
    target: 'manual-entry',
    title: 'Quick add with AI',
    body: "Type a sentence like 'CS midterm Friday at 3pm' or fill the form — both work.",
  },
  {
    target: 'ai-chat',
    title: 'Ask your calendar',
    body: 'Chat with your events. After each answer, tap a follow-up chip to dig deeper.',
  },
  {
    target: 'metrics',
    title: 'Everything is measured',
    body: 'Latency and token cost for every AI call show up here in real time.',
  },
  {
    title: "You're all set",
    body: "Click the 'i' in the header anytime to replay this tour.",
  },
];

const PADDING = 10; // padding around the highlighted element
const TOOLTIP_WIDTH = 360;
const TOOLTIP_GAP = 16;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OnboardingTour({ isOpen, onClose }: OnboardingTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Reset to step 0 each time the tour opens
  useEffect(() => {
    if (isOpen) setStepIndex(0);
  }, [isOpen]);

  const step = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  const measure = useCallback(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top - PADDING,
      left: r.left - PADDING,
      width: r.width + PADDING * 2,
      height: r.height + PADDING * 2,
    });
  }, [step]);

  // Measure + scroll the target into view when the step changes
  useLayoutEffect(() => {
    if (!isOpen) return;
    if (!step) return;
    if (step.target) {
      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Re-measure after scroll settles
        const id = window.setTimeout(measure, 420);
        measure();
        return () => window.clearTimeout(id);
      }
    }
    measure();
  }, [isOpen, stepIndex, step, measure]);

  // Re-measure on resize/scroll
  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [isOpen, measure]);

  const next = useCallback(() => {
    if (isLast) {
      onClose();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }, [isLast, onClose]);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  // Keyboard: Esc close; arrow keys navigate
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, next, prev, onClose]);

  // Focus the tooltip so keyboard nav works immediately
  useEffect(() => {
    if (!isOpen) return;
    tooltipRef.current?.focus();
  }, [isOpen, stepIndex]);

  // Compute tooltip position: centered when no target, otherwise flip above/below
  const tooltipStyle: CSSProperties = (() => {
    if (!rect) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: `${TOOLTIP_WIDTH}px`,
      };
    }
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const spaceBelow = vh - (rect.top + rect.height);
    const spaceAbove = rect.top;
    const placeBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove;

    // Horizontal: center over the target, clamp to viewport
    const desiredLeft = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    const left = Math.max(16, Math.min(desiredLeft, vw - TOOLTIP_WIDTH - 16));

    if (placeBelow) {
      return {
        top: `${rect.top + rect.height + TOOLTIP_GAP}px`,
        left: `${left}px`,
        width: `${TOOLTIP_WIDTH}px`,
      };
    }
    return {
      top: `${Math.max(16, rect.top - TOOLTIP_GAP)}px`,
      left: `${left}px`,
      width: `${TOOLTIP_WIDTH}px`,
      transform: 'translateY(-100%)',
    };
  })();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Dim overlay + spotlight (or full dim when no target) */}
          <motion.div
            key="tour-overlay"
            className="fixed inset-0 z-[60] pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            aria-hidden
          >
            {rect ? (
              <motion.div
                className="absolute rounded-2xl ring-[3px] ring-indigo-400"
                initial={false}
                animate={{
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                }}
                transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
                style={{
                  boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.72)',
                }}
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{ backgroundColor: 'rgba(15, 23, 42, 0.72)' }}
              />
            )}
          </motion.div>

          {/* Tooltip card */}
          <motion.div
            key={`tour-tooltip-${stepIndex}`}
            ref={tooltipRef}
            role="dialog"
            aria-modal="true"
            aria-label={step?.title}
            tabIndex={-1}
            className={cn(
              'fixed z-[70] bg-white rounded-2xl shadow-2xl border border-slate-100 p-5 outline-none'
            )}
            style={tooltipStyle}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', duration: 0.3 }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg">
                  {!step?.target && <Sparkles size={10} />}
                  Step {stepIndex + 1} of {STEPS.length}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close tour"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <h3 className="text-lg font-black text-slate-900 mb-1.5">{step?.title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed mb-5">{step?.body}</p>

            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
              >
                Skip Tour
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={prev}
                  disabled={isFirst}
                  aria-label="Previous step"
                  className={cn(
                    'flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-colors border',
                    isFirst
                      ? 'text-slate-300 border-slate-100 cursor-not-allowed'
                      : 'text-slate-700 border-slate-200 hover:bg-slate-50'
                  )}
                >
                  <ChevronLeft size={14} />
                  Prev
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label={isLast ? 'Finish tour' : 'Next step'}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-colors"
                >
                  {isLast ? 'Finish' : 'Next'}
                  {!isLast && <ChevronRight size={14} />}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
