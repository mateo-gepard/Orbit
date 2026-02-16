'use client';

import React, { useState, useMemo } from 'react';
import { useAbiturStore } from '@/lib/abitur-store';
import {
  ALL_SUBJECTS,
  SEMESTERS,
  SEMESTER_LABELS,
  type Semester,
  type SubjectDefinition,
  getSubject,
  isEingebracht,
  canToggle,
  canDropSemester,
  canAddSemester,
  isMandatory,
  countAllEinbringungen,
  calculateAbitur,
  calculateNeededAverage,
  getPointsColor,
  getPointsBg,
  isDeficit,
  applyExclusivity,
  EXCLUSIVE_GROUPS,
  canSubjectBeLF,
  canSubjectBeOralExam,
  validateExamCombination,
  checkFieldCoverage,
  getEinbringungRule,
  getAllEinbringungRules,
  optimizeEinbringungen,
  type AbiturProfile,
  type AbiturResult,
} from '@/lib/abitur';
import { cn } from '@/lib/utils';
import {
  GraduationCap,
  ChevronRight,
  ChevronLeft,
  Check,
  Lock,
  TrendingUp,
  Settings,
  ArrowLeft,
  Sparkles,
  Shield,
  Layers,
  PenLine,
  CircleDot,
  AlertTriangle,
  BookOpen,
  Plus,
  X,
  Wand2,
  Replace,
} from 'lucide-react';

// ─── Field color accents ───────────────────────────────────

const FIELD_COLOR: Record<number, string> = {
  1: 'text-violet-400',
  2: 'text-amber-400',
  3: 'text-sky-400',
  0: 'text-muted-foreground/40',
};
const FIELD_BG: Record<number, string> = {
  1: 'bg-violet-500/10',
  2: 'bg-amber-500/10',
  3: 'bg-sky-500/10',
  0: 'bg-foreground/[0.03]',
};

const CAT_LABELS: Record<string, string> = {
  language: 'Sprachen',
  art: 'Musische Fächer',
  social: 'Gesellschaftswiss.',
  stem: 'MINT',
  sport: 'Sport',
  seminar: 'Seminare',
  other: 'Sonstige',
};

const MANDATORY_IDS = ['deu', 'mat', 'wsem', 'psem'];

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════

export default function AbiturPage() {
  const profile = useAbiturStore((s) => s.profile);
  if (!profile.onboardingComplete) return <OnboardingWizard />;
  return <AbiturDashboard />;
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

/** Count how many grades have been entered (non-null) across all semesters */
function totalEnteredGrades(profile: AbiturProfile): number {
  return (profile.grades ?? []).filter((g) => g.points !== null && g.subjectId !== 'psem').length;
}

/** Has the user entered enough data for meaningful calculations? */
function hasEnoughData(profile: AbiturProfile): boolean {
  return totalEnteredGrades(profile) > 0;
}

// ═══════════════════════════════════════════════════════════
// Onboarding Wizard — Immersive full-screen flow
// ═══════════════════════════════════════════════════════════

function OnboardingWizard() {
  const { setSubjects, setLeistungsfach, setExamSubject, completeOnboarding } = useAbiturStore();
  const profile = useAbiturStore((s) => s.profile);

  const [step, setStep] = useState(0);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(profile.subjects);
  const [lf, setLf] = useState(profile.leistungsfach);
  const [exam4, setExam4] = useState(profile.examSubjects[3] || '');
  const [exam5, setExam5] = useState(profile.examSubjects[4] || '');

  const lfOptions = ALL_SUBJECTS.filter((s) => s.canBeLF);

  const groupedOptional = useMemo(() => {
    const cats: Record<string, SubjectDefinition[]> = {};
    ALL_SUBJECTS.forEach((s) => {
      if (MANDATORY_IDS.includes(s.id)) return;
      if (!cats[s.category]) cats[s.category] = [];
      cats[s.category].push(s);
    });
    return cats;
  }, []);

  const toggleSubject = (id: string) => {
    if (MANDATORY_IDS.includes(id)) return;
    setSelectedSubjects((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      return applyExclusivity([...prev, id], id);
    });
  };

  const finish = () => {
    setSubjects(selectedSubjects);
    setLeistungsfach(lf);
    setExamSubject(3, exam4);
    setExamSubject(4, exam5);
    completeOnboarding();
  };

  const canNext =
    step === 0 ||
    (step === 1 && selectedSubjects.length >= 8) ||
    (step === 2 && lf !== '' && canSubjectBeLF(lf).valid) ||
    (step === 3 && exam4 !== '' && exam5 !== '' && validateExamCombination(lf, exam4, exam5).valid);

  const stepTitles = ['', 'Fächerwahl', 'Leistungsfach', 'Kolloquien'];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Top strip */}
      <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.5} />
          <span className="text-[11px] font-mono text-muted-foreground/50">ABITUR SETUP</span>
          {step > 0 && (
            <span className="text-[11px] text-muted-foreground/30">
              · {stepTitles[step]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'h-1 rounded-full transition-all duration-500',
                i <= step ? 'bg-emerald-500 w-6' : 'bg-foreground/[0.06] w-3'
              )}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 lg:px-8 py-8">
        {step === 0 && (
          <div className="text-center max-w-md space-y-6">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-emerald-500/10 mb-2">
              <GraduationCap className="h-8 w-8 text-emerald-500" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Qualifikationsphase</h1>
              <p className="text-[13px] text-muted-foreground/50 mt-2 leading-relaxed">
                Dein persönlicher Abiturrechner. Noten eintragen, Einbringungen verwalten, Schnitte pro Halbjahr tracken.
              </p>
            </div>
            <div className="flex items-center justify-center gap-6 pt-2">
              {[
                { icon: Layers, label: 'Halbjahre' },
                { icon: CircleDot, label: 'Einbringungen' },
                { icon: Shield, label: 'Hürden' },
              ].map((f) => (
                <div key={f.label} className="flex flex-col items-center gap-1.5">
                  <div className="h-9 w-9 rounded-xl bg-foreground/[0.04] flex items-center justify-center">
                    <f.icon className="h-4 w-4 text-muted-foreground/40" strokeWidth={1.5} />
                  </div>
                  <span className="text-[9px] text-muted-foreground/30 uppercase tracking-widest">{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="w-full max-w-lg space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-semibold tracking-tight">Deine Fächer</h2>
              <p className="text-[11px] text-muted-foreground/40 mt-1">
                Pflichtfächer vorausgewählt · {selectedSubjects.length} gewählt
              </p>
            </div>
            <div className="space-y-5 max-h-[55vh] overflow-y-auto pr-1">
              {Object.entries(groupedOptional).map(([cat, subs]) => (
                <div key={cat}>
                  <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest mb-2">
                    {CAT_LABELS[cat] || cat}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {subs.map((s) => {
                      const selected = selectedSubjects.includes(s.id);
                      const mandatory = MANDATORY_IDS.includes(s.id);
                      // Check if this subject is blocked by an exclusive group
                      const exclusiveGroup = EXCLUSIVE_GROUPS.find((g) => g.includes(s.id));
                      const blockedBy = exclusiveGroup
                        ? exclusiveGroup.find((id) => id !== s.id && selectedSubjects.includes(id))
                        : undefined;
                      const blockedSubject = blockedBy ? getSubject(blockedBy) : undefined;
                      return (
                        <button
                          key={s.id}
                          onClick={() => toggleSubject(s.id)}
                          disabled={mandatory}
                          className={cn(
                            'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12px] text-left transition-all',
                            selected
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'hover:bg-foreground/[0.03] text-muted-foreground/60',
                            mandatory && 'opacity-40 cursor-not-allowed'
                          )}
                          title={blockedSubject && !selected ? `Wählt automatisch ${blockedSubject.name} ab` : undefined}
                        >
                          <div
                            className={cn(
                              'h-4 w-4 rounded-[5px] border flex items-center justify-center shrink-0 transition-all',
                              selected
                                ? 'bg-emerald-500 border-emerald-500'
                                : 'border-border/60'
                            )}
                          >
                            {selected && (
                              <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 16 16" fill="none">
                                <path d="M4 8.5L6.5 11L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <span className="truncate">{s.name}</span>
                          <div className="ml-auto flex items-center gap-1">
                            {s.lateStart && (
                              <span className="text-[8px] text-amber-500 bg-amber-500/10 px-1 py-0.5 rounded font-medium">spät</span>
                            )}
                            {s.requiresAdditum && (
                              <span className="text-[8px] text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded font-medium">Add.</span>
                            )}
                            <span className={cn('text-[9px] font-mono', FIELD_COLOR[s.field])}>
                              {s.shortName}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="w-full max-w-md space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-semibold tracking-tight">Leistungsfach</h2>
              <p className="text-[11px] text-muted-foreground/40 mt-1">
                Dein 3. schriftliches Abiturfach (erhöhtes Anforderungsniveau)
              </p>
            </div>
            <div className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1">
              {lfOptions
                .filter((s) => selectedSubjects.includes(s.id))
                .map((s) => {
                  const validation = canSubjectBeLF(s.id);
                  const isDisabled = !validation.valid;
                  return (
                    <button
                      key={s.id}
                      onClick={() => !isDisabled && setLf(s.id)}
                      disabled={isDisabled}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-xl px-4 py-3 text-[13px] text-left transition-all',
                        isDisabled
                          ? 'opacity-30 cursor-not-allowed'
                          : lf === s.id
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium'
                            : 'hover:bg-foreground/[0.03] text-muted-foreground/70'
                      )}
                    >
                      <div
                        className={cn(
                          'h-8 w-8 rounded-lg flex items-center justify-center text-[11px] font-bold font-mono',
                          lf === s.id ? 'bg-emerald-500/20 text-emerald-500' : FIELD_BG[s.field],
                          lf !== s.id && FIELD_COLOR[s.field]
                        )}
                      >
                        {s.shortName}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p>{s.name}</p>
                          {s.requiresAdditum && (
                            <span className="text-[8px] text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded font-medium">Additum</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground/30">
                          Aufgabenfeld {s.field || '—'} · {s.hoursPerWeek}h/Woche
                          {validation.reason && !isDisabled ? ` · ${validation.reason}` : ''}
                          {isDisabled && validation.reason ? ` · ${validation.reason}` : ''}
                        </p>
                      </div>
                      {lf === s.id && (
                        <div className="h-5 w-5 rounded-full bg-emerald-500 flex items-center justify-center">
                          <Check className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="w-full max-w-md space-y-6">
            <div className="text-center">
              <h2 className="text-lg font-semibold tracking-tight">Kolloquiumsfächer</h2>
              <p className="text-[11px] text-muted-foreground/40 mt-1">
                4. und 5. Prüfungsfach (mündlich) · Alle 3 Aufgabenfelder müssen abgedeckt sein
              </p>
            </div>

            {/* Field coverage indicator */}
            {(() => {
              const validation = validateExamCombination(lf, exam4, exam5);
              const coverage = checkFieldCoverage(['deu', 'mat', lf, exam4, exam5].filter(Boolean));
              const FIELD_NAMES: Record<number, string> = { 1: 'Sprachlich-lit.-künstl.', 2: 'Gesellschaftswiss.', 3: 'Math.-naturwiss.' };
              return (
                <div className="space-y-2">
                  {/* Field coverage badges */}
                  <div className="flex items-center justify-center gap-2">
                    {([1, 2, 3] as const).map((f) => {
                      const covered = f === 1 ? coverage.field1 : f === 2 ? coverage.field2 : coverage.field3;
                      return (
                        <div
                          key={f}
                          className={cn(
                            'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-all border',
                            covered
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                              : 'bg-foreground/[0.02] border-border/40 text-muted-foreground/30'
                          )}
                        >
                          {covered ? <Check className="h-2.5 w-2.5" /> : <span className="h-2.5 w-2.5 rounded-full border border-current" />}
                          <span>AF {f}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Validation errors */}
                  {validation.errors.length > 0 && (
                    <div className="rounded-xl bg-red-500/[0.06] border border-red-500/15 px-3 py-2.5 space-y-1">
                      {validation.errors.map((err, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <AlertTriangle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
                          <p className="text-[11px] text-red-400">{err}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Validation warnings */}
                  {validation.warnings.length > 0 && validation.errors.length === 0 && (
                    <div className="rounded-xl bg-amber-500/[0.06] border border-amber-500/15 px-3 py-2.5 space-y-1">
                      {validation.warnings.map((warn, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                          <p className="text-[11px] text-amber-500">{warn}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {[
              { label: '4. Prüfung (Kolloquium)', val: exam4, setVal: setExam4, other: exam5 },
              { label: '5. Prüfung (Kolloquium)', val: exam5, setVal: setExam5, other: exam4 },
            ].map((row) => (
              <div key={row.label}>
                <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest mb-2">
                  {row.label}
                </p>
                <div className="grid grid-cols-2 gap-1.5 max-h-[22vh] overflow-y-auto pr-1">
                  {selectedSubjects
                    .filter((id) => id !== 'deu' && id !== 'mat' && id !== lf && id !== 'wsem' && id !== 'psem' && id !== row.other)
                    .map((id) => {
                      const s = getSubject(id);
                      if (!s) return null;
                      const oralCheck = canSubjectBeOralExam(id);
                      const isDisabled = !oralCheck.valid;

                      // Check if picking this would create an exclusive conflict
                      const exclusiveConflict = row.other
                        ? EXCLUSIVE_GROUPS.some((g) => g.includes(id) && g.includes(row.other))
                        : false;

                      // Show field coverage hint
                      const hypothetical = ['deu', 'mat', lf, row.other, id].filter(Boolean);
                      const coverage = checkFieldCoverage(hypothetical);

                      return (
                        <button
                          key={id}
                          onClick={() => !isDisabled && !exclusiveConflict && row.setVal(id)}
                          disabled={isDisabled || exclusiveConflict}
                          className={cn(
                            'rounded-xl px-3 py-2.5 text-[12px] text-left transition-all relative',
                            isDisabled || exclusiveConflict
                              ? 'opacity-30 cursor-not-allowed'
                              : row.val === id
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium'
                                : 'hover:bg-foreground/[0.03] text-muted-foreground/60'
                          )}
                          title={
                            isDisabled ? oralCheck.reason
                            : exclusiveConflict ? `Schließt sich mit dem anderen Kolloquium aus`
                            : undefined
                          }
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{s.name}</span>
                            {s.requiresAdditum && (
                              <span className="text-[7px] text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded font-medium shrink-0">Add.</span>
                            )}
                          </div>
                          {isDisabled && (
                            <p className="text-[9px] text-red-400/70 mt-0.5 truncate">{oralCheck.reason}</p>
                          )}
                          {exclusiveConflict && (
                            <p className="text-[9px] text-red-400/70 mt-0.5">Exklusiv-Konflikt</p>
                          )}
                          {!isDisabled && !exclusiveConflict && row.val !== id && !coverage.allCovered && (
                            <p className="text-[9px] text-amber-500/50 mt-0.5">
                              {!coverage.field1 && 'AF I fehlt'}
                              {!coverage.field2 && 'AF II fehlt'}
                              {!coverage.field3 && 'AF III fehlt'}
                            </p>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="px-4 lg:px-8 py-4 border-t border-border/30 flex items-center justify-between">
        <button
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className={cn(
            'flex items-center gap-1 text-[12px] transition-colors',
            step === 0
              ? 'text-muted-foreground/20 cursor-not-allowed'
              : 'text-muted-foreground/50 hover:text-foreground'
          )}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Zurück
        </button>
        {step < 3 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-[13px] font-medium transition-all active:scale-95',
              canNext
                ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/20'
                : 'bg-foreground/[0.05] text-muted-foreground/30 cursor-not-allowed'
            )}
          >
            Weiter
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={finish}
            disabled={!canNext}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-[13px] font-medium transition-all active:scale-95',
              canNext
                ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/20'
                : 'bg-foreground/[0.05] text-muted-foreground/30 cursor-not-allowed'
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Starten
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Dashboard
// ═══════════════════════════════════════════════════════════

type View = Semester | 'overview' | 'settings' | 'subjects' | 'einbringungen';

function AbiturDashboard() {
  const profile = useAbiturStore((s) => s.profile);
  const [view, setView] = useState<View>('overview');

  const result = useMemo(() => calculateAbitur(profile), [profile]);

  // Full-page sub-views with back navigation
  if (view === 'settings' || view === 'subjects' || view === 'einbringungen') {
    const titles: Record<string, string> = { settings: 'EINSTELLUNGEN', subjects: 'FÄCHER', einbringungen: 'EINBRINGUNGEN' };
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center gap-2">
          <button
            onClick={() => setView('overview')}
            className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
          </button>
          <GraduationCap className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.5} />
          <span className="text-[11px] font-mono text-muted-foreground/50">{titles[view]}</span>
        </div>
        <div className="flex-1 px-4 lg:px-8 py-6 max-w-2xl mx-auto w-full">
          {view === 'settings' && <SettingsView />}
          {view === 'subjects' && <SubjectsView />}
          {view === 'einbringungen' && <EinbringungenView profile={profile} />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Flight-strip header */}
      <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.5} />
          <span className="text-[11px] font-mono text-muted-foreground/50">ABITUR</span>
          <span className="text-[11px] text-muted-foreground/30">
            · {profile.schoolYear}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('subjects')}
            className="text-muted-foreground/30 hover:text-foreground transition-colors"
            title="Fächer verwalten"
          >
            <BookOpen className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setView('einbringungen')}
            className="text-muted-foreground/30 hover:text-foreground transition-colors"
            title="Einbringungen"
          >
            <CircleDot className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setView('settings')}
            className="text-muted-foreground/30 hover:text-foreground transition-colors"
            title="Einstellungen"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-4 lg:px-8 py-2 border-b border-border/30 flex items-center gap-1 overflow-x-auto">
        <TabBtn active={view === 'overview'} onClick={() => setView('overview')}>
          Gesamt
        </TabBtn>
        {SEMESTERS.map((s) => (
          <TabBtn key={s} active={view === s} onClick={() => setView(s)}>
            {SEMESTER_LABELS[s]}
          </TabBtn>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 lg:px-8 py-6 max-w-2xl mx-auto w-full">
        {view === 'overview' ? (
          <OverviewTab result={result} profile={profile} onNavigate={setView} />
        ) : (
          <SemesterTab semester={view as Semester} result={result} profile={profile} />
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap',
        active
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'text-muted-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.03]'
      )}
    >
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// Empty State Warning
// ═══════════════════════════════════════════════════════════

function EmptyWarning({ gradesEntered, totalPossible, onNavigate }: { gradesEntered: number; totalPossible: number; onNavigate?: (v: View) => void }) {
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-[13px] font-medium text-amber-600 dark:text-amber-400">
            {gradesEntered === 0 ? 'Noch keine Noten eingetragen' : 'Unvollständige Daten'}
          </p>
          <p className="text-[11px] text-muted-foreground/50 mt-1 leading-relaxed">
            {gradesEntered === 0
              ? 'Die Berechnung ist erst aussagekräftig, wenn du Noten in den Halbjahren einträgst. Wähle ein Halbjahr oben aus und trage deine Punkte ein.'
              : `${gradesEntered} von ${totalPossible} möglichen Noten eingetragen. Die Prognose und Schnitte werden mit jeder weiteren Note genauer.`
            }
          </p>
          {gradesEntered === 0 && onNavigate && (
            <button
              onClick={() => onNavigate('12/1')}
              className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-amber-600 dark:text-amber-400 hover:text-amber-500 transition-colors"
            >
              <PenLine className="h-3 w-3" />
              Noten eintragen
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Overview Tab — clean, only meaningful data
// ═══════════════════════════════════════════════════════════

function OverviewTab({ result, profile, onNavigate }: { result: AbiturResult; profile: AbiturProfile; onNavigate: (v: View) => void }) {
  const einCount = countAllEinbringungen(profile);
  const entered = totalEnteredGrades(profile);
  const totalPossible = profile.subjects.filter((s) => s !== 'psem').length * 4;
  const hasData = hasEnoughData(profile);
  const pct = hasData ? Math.round((result.totalPoints / result.maxPoints) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Empty state warning */}
      {!hasData && (
        <EmptyWarning gradesEntered={0} totalPossible={totalPossible} onNavigate={onNavigate} />
      )}

      {/* Low data warning */}
      {hasData && entered < totalPossible * 0.25 && (
        <EmptyWarning gradesEntered={entered} totalPossible={totalPossible} />
      )}

      {/* Grade hero — only show when we have data */}
      <div className="flex flex-col items-center pt-2 pb-2">
        <div className="relative h-28 w-28 flex items-center justify-center">
          <svg className="absolute inset-0" viewBox="0 0 112 112">
            <circle cx="56" cy="56" r="48" fill="none" stroke="currentColor" strokeWidth="3" className="text-foreground/[0.04]" />
            {hasData && (
              <circle
                cx="56" cy="56" r="48" fill="none" strokeWidth="3"
                className={cn(result.passed ? 'text-emerald-500' : 'text-amber-500')}
                strokeLinecap="round"
                strokeDasharray={`${pct * 3.016} 301.6`}
                strokeDashoffset="0"
                transform="rotate(-90 56 56)"
                style={{ transition: 'stroke-dasharray 1s ease' }}
              />
            )}
          </svg>
          <div className="text-center">
            {hasData ? (
              <>
                <p className="text-3xl font-black tabular-nums tracking-tight">{result.finalGrade.toFixed(1)}</p>
                <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest mt-0.5">Note</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-muted-foreground/15">—</p>
                <p className="text-[9px] text-muted-foreground/20 uppercase tracking-widest mt-0.5">Keine Daten</p>
              </>
            )}
          </div>
        </div>

        {hasData && (
          <p className="text-[12px] text-muted-foreground/40 mt-2 tabular-nums font-mono">
            {result.totalPoints} / {result.maxPoints} Punkte
          </p>
        )}
      </div>

      {/* Notenschnitt — average grades summary */}
      {hasData && (
        <div className="rounded-2xl border border-border/40 p-4">
          <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest mb-3">Notenschnitt</p>
          {/* Global averages */}
          {(() => {
            const allGrades = (profile.grades ?? []).filter((g) => g.points !== null && g.subjectId !== 'psem');
            const allAvg = allGrades.length > 0 ? allGrades.reduce((s, g) => s + (g.points ?? 0), 0) / allGrades.length : null;
            const punkteToNote = (p: number) => Math.max(1.0, Math.min(6.0, Math.round((17 - p) / 3 * 10) / 10));
            const globalNote = allAvg !== null ? punkteToNote(allAvg) : null;
            return (
              <>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl bg-foreground/[0.03] p-3">
                    <p className="text-xl font-bold tabular-nums leading-none">
                      {allAvg !== null ? allAvg.toFixed(2) : '—'}
                    </p>
                    <p className="text-[8px] text-muted-foreground/25 uppercase tracking-wider mt-1.5">Ø Punkte</p>
                  </div>
                  <div className="rounded-xl bg-foreground/[0.03] p-3">
                    <p className="text-xl font-bold tabular-nums leading-none text-emerald-500">
                      {result.blockI.einbringungCount > 0 ? result.blockI.average.toFixed(2) : '—'}
                    </p>
                    <p className="text-[8px] text-muted-foreground/25 uppercase tracking-wider mt-1.5">Ø eingeb.</p>
                  </div>
                  <div className="rounded-xl bg-foreground/[0.03] p-3">
                    <p className={cn('text-xl font-bold tabular-nums leading-none', globalNote !== null && globalNote <= 2.5 ? 'text-emerald-500' : globalNote !== null && globalNote <= 3.5 ? 'text-amber-500' : globalNote !== null ? 'text-red-400' : '')}>
                      {globalNote !== null ? globalNote.toFixed(1) : '—'}
                    </p>
                    <p className="text-[8px] text-muted-foreground/25 uppercase tracking-wider mt-1.5">Schulnote</p>
                  </div>
                </div>
                {/* Per-Halbjahr Schulnoten */}
                {result.semesterStats.some((ss) => ss.enteredCount > 0) && (
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    {result.semesterStats.map((ss) => {
                      const avg = ss.allAverage;
                      const note = avg !== null ? punkteToNote(avg) : null;
                      return (
                        <div key={ss.semester} className="rounded-lg bg-foreground/[0.02] p-2 text-center">
                          <p className="text-[9px] text-muted-foreground/30 font-medium mb-1">{SEMESTER_LABELS[ss.semester]}</p>
                          {note !== null ? (
                            <>
                              <p className={cn('text-[15px] font-bold tabular-nums leading-none', note <= 2.5 ? 'text-emerald-500' : note <= 3.5 ? 'text-amber-500' : 'text-red-400')}>
                                {note.toFixed(1)}
                              </p>
                              <p className="text-[7px] text-muted-foreground/20 font-mono mt-0.5">{avg!.toFixed(1)}P</p>
                            </>
                          ) : (
                            <p className="text-[15px] font-bold text-muted-foreground/15 leading-none">—</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Block I + II — only show meaningful values */}
      {hasData && (
        <div className="grid grid-cols-2 gap-3">
          <div className={cn(
            'rounded-2xl border p-4 text-center',
            result.blockI.contributedGrades.length > 0
              ? result.blockI.passed ? 'border-emerald-500/20 bg-emerald-500/[0.03]' : 'border-red-500/20 bg-red-500/[0.03]'
              : 'border-border/40'
          )}>
            <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest">Block I</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{result.blockI.totalPoints}</p>
            <p className="text-[10px] text-muted-foreground/30 font-mono mt-0.5">/ {result.blockI.maxPoints}</p>
            <p className="text-[9px] text-muted-foreground/20 mt-1">{result.blockI.einbringungCount} Einbr.</p>
          </div>
          <div className={cn(
            'rounded-2xl border p-4 text-center',
            result.blockII.exams.length > 0
              ? result.blockII.passed ? 'border-emerald-500/20 bg-emerald-500/[0.03]' : 'border-red-500/20 bg-red-500/[0.03]'
              : 'border-border/40'
          )}>
            <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest">Block II</p>
            {result.blockII.exams.length > 0 ? (
              <>
                <p className="text-2xl font-bold tabular-nums mt-1">{result.blockII.totalPoints}</p>
                <p className="text-[10px] text-muted-foreground/30 font-mono mt-0.5">/ {result.blockII.maxPoints}</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-muted-foreground/15 mt-1">—</p>
                <p className="text-[10px] text-muted-foreground/20 mt-0.5">Keine Prüfungen</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Einbringungen bar */}
      <button
        onClick={() => onNavigate('einbringungen')}
        className="w-full rounded-2xl border border-border/40 p-4 text-left hover:bg-foreground/[0.02] transition-colors group"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-muted-foreground/30 uppercase tracking-widest">Einbringungen</span>
          <div className="flex items-center gap-2">
            <span className={cn('text-[13px] font-bold tabular-nums', einCount >= 40 ? 'text-emerald-500' : 'text-amber-500')}>
              {einCount}<span className="text-muted-foreground/30 font-normal"> / 40</span>
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/20 group-hover:text-muted-foreground/40 transition-colors" />
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-foreground/[0.05] overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700', einCount >= 40 ? 'bg-emerald-500' : 'bg-amber-500')}
            style={{ width: `${Math.min(100, (einCount / 40) * 100)}%` }}
          />
        </div>
      </button>

      {/* Semester cards — clickable to navigate */}
      <div>
        <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest mb-3">Halbjahre</p>
        <div className="grid grid-cols-2 gap-3">
          {result.semesterStats.map((ss) => (
            <button
              key={ss.semester}
              onClick={() => onNavigate(ss.semester)}
              className="rounded-2xl border border-border/40 p-4 space-y-3 text-left hover:bg-foreground/[0.02] transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold">{SEMESTER_LABELS[ss.semester]}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-muted-foreground/25 font-mono">
                    {ss.enteredCount}/{ss.totalSubjects}
                  </span>
                  <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/15 group-hover:text-muted-foreground/30 transition-colors" />
                </div>
              </div>
              {ss.enteredCount > 0 ? (
                <>
                  <div className="flex items-end gap-3">
                    <div>
                      <p className="text-xl font-bold tabular-nums leading-none">
                        {ss.allAverage !== null ? ss.allAverage.toFixed(1) : '—'}
                      </p>
                      <p className="text-[8px] text-muted-foreground/25 uppercase tracking-wider mt-1">Ø Punkte</p>
                    </div>
                    <div className="h-6 w-px bg-border/40" />
                    {(() => {
                      const avg = ss.allAverage;
                      if (avg === null) return null;
                      const note = Math.round((17 - avg) / 3 * 10) / 10;
                      const clamped = Math.max(1.0, Math.min(6.0, note));
                      return (
                        <div>
                          <p className={cn('text-xl font-bold tabular-nums leading-none', clamped <= 2.5 ? 'text-emerald-500' : clamped <= 3.5 ? 'text-amber-500' : 'text-red-400')}>
                            {clamped.toFixed(1)}
                          </p>
                          <p className="text-[8px] text-muted-foreground/25 uppercase tracking-wider mt-1">Schulnote</p>
                        </div>
                      );
                    })()}
                  </div>
                  {ss.deficits > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-mono tabular-nums text-red-400">
                        {ss.deficits} Defizit{ss.deficits !== 1 ? 'e' : ''}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground/20 py-1">
                  Noch keine Noten
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Hurdles — only show when there's data */}
      {hasData && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest">Hürden</p>
            {result.hurdles.every((h) => h.passed) ? (
              <span className="text-[10px] text-emerald-500 font-medium">Alle bestanden</span>
            ) : (
              <span className="text-[10px] text-red-400 font-medium">
                {result.hurdles.filter((h) => !h.passed).length} offen
              </span>
            )}
          </div>
          <div className="rounded-2xl border border-border/40 divide-y divide-border/30">
            {result.hurdles.map((h) => (
              <div
                key={h.id}
                className={cn(
                  'flex items-center gap-2.5 px-4 py-2.5 text-[12px]',
                  h.passed ? 'text-muted-foreground/40' : 'text-foreground'
                )}
              >
                <div className={cn(
                  'h-1.5 w-1.5 rounded-full shrink-0',
                  h.passed ? 'bg-emerald-500' : 'bg-red-500'
                )} />
                <span className="flex-1">{h.label}</span>
                <span className="text-[10px] text-muted-foreground/30 font-mono tabular-nums">{h.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projection — only when enough data */}
      {hasData && entered >= 4 && (
        <div className="rounded-2xl border border-border/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground/30" strokeWidth={1.5} />
            <span className="text-[10px] text-muted-foreground/30 uppercase tracking-widest">Prognose 1,0</span>
          </div>
          {(() => {
            const projection = calculateNeededAverage(profile, 1.0);
            return (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-foreground/[0.03] p-3 text-center">
                  <p className={cn('text-xl font-bold tabular-nums', !projection.achievable && 'text-muted-foreground/30')}>
                    {projection.achievable ? projection.neededBlockIAvg.toFixed(1) : '—'}
                  </p>
                  <p className="text-[9px] text-muted-foreground/30 uppercase tracking-wider mt-1">Ø Noten nötig</p>
                </div>
                <div className="rounded-xl bg-foreground/[0.03] p-3 text-center">
                  <p className={cn('text-xl font-bold tabular-nums', !projection.achievable && 'text-muted-foreground/30')}>
                    {projection.achievable ? projection.neededExamAvg.toFixed(1) : '—'}
                  </p>
                  <p className="text-[9px] text-muted-foreground/30 uppercase tracking-wider mt-1">Ø Prüfungen nötig</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Exams section */}
      <ExamsSection profile={profile} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Semester Tab — grade entry per subject + einbringung toggles
// ═══════════════════════════════════════════════════════════

function SemesterTab({ semester, result, profile }: { semester: Semester; result: AbiturResult; profile: AbiturProfile }) {
  const ss = result.semesterStats.find((s) => s.semester === semester)!;
  const { setGrade, toggleEinbringung } = useAbiturStore();
  const subjects = profile.subjects.filter((id) => id !== 'psem');

  return (
    <div className="space-y-6">
      {/* Semester header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{SEMESTER_LABELS[semester]}</h2>
          <p className="text-[11px] text-muted-foreground/40">
            {ss.enteredCount === 0
              ? 'Trage deine Noten hier ein'
              : `${ss.enteredCount} von ${ss.totalSubjects} Noten eingetragen`
            }
          </p>
        </div>
        {ss.enteredCount > 0 && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xl font-bold tabular-nums leading-none">
                {ss.allAverage !== null ? ss.allAverage.toFixed(1) : '—'}
              </p>
              <p className="text-[8px] text-muted-foreground/25 uppercase tracking-wider mt-0.5">Ø Punkte</p>
            </div>
            <div className="h-6 w-px bg-border/40" />
            {(() => {
              const avg = ss.allAverage;
              if (avg === null) return null;
              const note = Math.round((17 - avg) / 3 * 10) / 10;
              const clamped = Math.max(1.0, Math.min(6.0, note));
              return (
                <div className="text-right">
                  <p className={cn('text-xl font-bold tabular-nums leading-none', clamped <= 2.5 ? 'text-emerald-500' : clamped <= 3.5 ? 'text-amber-500' : 'text-red-400')}>
                    {clamped.toFixed(1)}
                  </p>
                  <p className="text-[8px] text-muted-foreground/25 uppercase tracking-wider mt-0.5">Schulnote</p>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Empty hint */}
      {ss.enteredCount === 0 && (
        <div className="rounded-xl bg-foreground/[0.02] border border-dashed border-border/40 p-4 text-center">
          <PenLine className="h-4 w-4 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-[12px] text-muted-foreground/30">
            Klicke auf das <span className="font-mono text-muted-foreground/40">—</span> neben einem Fach, um die Punktzahl einzutragen
          </p>
        </div>
      )}

      {/* Compact counters — only show when data exists */}
      {ss.enteredCount > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-lg bg-foreground/[0.03] px-2.5 py-1.5">
            <CircleDot className="h-3 w-3 text-emerald-500" />
            <span className="text-[11px] font-mono tabular-nums">{ss.einbringungCount}</span>
            <span className="text-[10px] text-muted-foreground/30">eingeb.</span>
          </div>
          {ss.deficits > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5">
              <Shield className="h-3 w-3 text-red-400" />
              <span className="text-[11px] font-mono tabular-nums text-red-400">{ss.deficits}</span>
              <span className="text-[10px] text-muted-foreground/30">Defizite</span>
            </div>
          )}
        </div>
      )}

      {/* Grade rows */}
      <div className="rounded-2xl border border-border/40 divide-y divide-border/30 overflow-hidden">
        {subjects.map((subjectId) => {
          const subj = getSubject(subjectId);
          if (!subj) return null;
          const grade = (profile.grades ?? []).find((g) => g.subjectId === subjectId && g.semester === semester);
          const pts = grade?.points ?? null;
          const mandatory = isMandatory(subjectId, profile);
          const eingebracht = isEingebracht(subjectId, semester, profile);
          const toggleable = canToggle(subjectId, profile);
          
          // Dynamic checks: can this specific semester be dropped or added?
          const dropCheck = canDropSemester(subjectId, semester, profile);
          const addCheck = canAddSemester(subjectId, semester, profile);
          
          // Can toggle OFF (drop) if dropCheck allows it; can toggle ON (add) if addCheck allows it
          const canToggleThis = toggleable && (eingebracht ? dropCheck.canDrop : addCheck.canAdd);
          const blockReason = eingebracht ? dropCheck.reason : addCheck.reason;

          return (
            <div
              key={subjectId}
              className={cn(
                'flex items-center gap-3 px-4 py-3 transition-colors',
                !eingebracht && pts !== null && 'bg-foreground/[0.01]'
              )}
            >
              {/* Einbringung toggle */}
              <button
                onClick={() => canToggleThis && toggleEinbringung(subjectId, semester)}
                disabled={!canToggleThis}
                title={!canToggleThis && !mandatory ? blockReason : undefined}
                className={cn(
                  'h-5 w-5 rounded-[5px] border flex items-center justify-center shrink-0 transition-all',
                  eingebracht
                    ? (mandatory || (!dropCheck.canDrop && toggleable))
                      ? 'bg-emerald-500/15 border-emerald-500/30'
                      : 'bg-emerald-500 border-emerald-500'
                    : !addCheck.canAdd && toggleable
                      ? 'border-amber-500/30 bg-amber-500/5 cursor-not-allowed'
                      : 'border-border/50 hover:border-emerald-500/40',
                  !canToggleThis && 'cursor-not-allowed'
                )}
              >
                {eingebracht && mandatory && <Lock className="h-2.5 w-2.5 text-emerald-500" />}
                {eingebracht && !mandatory && !dropCheck.canDrop && <Lock className="h-2.5 w-2.5 text-amber-500" />}
                {eingebracht && !mandatory && dropCheck.canDrop && (
                  <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 16 16" fill="none">
                    <path d="M4 8.5L6.5 11L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {!eingebracht && !addCheck.canAdd && <Lock className="h-2.5 w-2.5 text-amber-500" />}
              </button>

              {/* Subject badge */}
              <div className={cn(
                'h-7 w-7 rounded-lg flex items-center justify-center text-[9px] font-bold font-mono shrink-0',
                FIELD_BG[subj.field],
                FIELD_COLOR[subj.field],
                !eingebracht && pts !== null && 'opacity-40'
              )}>
                {subj.shortName}
              </div>

              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-[12px] font-medium truncate',
                  !eingebracht && pts !== null && 'text-muted-foreground/40'
                )}>
                  {subj.name}
                </p>
              </div>

              {/* Points input */}
              <PointsInput
                value={pts}
                onChange={(v) => setGrade(subjectId, semester, v)}
                dimmed={!eingebracht && pts !== null}
              />
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground/25">
        <div className="flex items-center gap-1">
          <Lock className="h-2.5 w-2.5" />
          <span>Pflicht</span>
        </div>
        <div className="flex items-center gap-1">
          <Lock className="h-2.5 w-2.5 text-amber-500" />
          <span>Limit erreicht</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-[3px] bg-emerald-500 flex items-center justify-center">
            <svg className="h-2 w-2 text-white" viewBox="0 0 16 16" fill="none">
              <path d="M4 8.5L6.5 11L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span>Eingebracht</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-[3px] border border-border/50" />
          <span>Gestrichen</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Points Input — inline, clean
// ═══════════════════════════════════════════════════════════

function PointsInput({ value, onChange, dimmed }: { value: number | null; onChange: (v: number | null) => void; dimmed?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [tmp, setTmp] = useState('');

  const startEdit = () => {
    setTmp(value !== null ? String(value) : '');
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const n = parseInt(tmp);
    if (tmp === '' || tmp === '-') onChange(null);
    else if (!isNaN(n) && n >= 0 && n <= 15) onChange(n);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        inputMode="numeric"
        value={tmp}
        onChange={(e) => setTmp(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="w-11 h-8 rounded-lg border border-emerald-500/40 text-center text-[13px] font-mono font-bold bg-background focus:outline-none"
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className={cn(
        'w-11 h-8 rounded-lg text-center text-[13px] font-mono font-bold transition-all hover:ring-1 hover:ring-border/40',
        value !== null ? getPointsBg(value) : 'bg-foreground/[0.03]',
        value !== null ? getPointsColor(value) : 'text-muted-foreground/20',
        dimmed && 'opacity-40'
      )}
    >
      {value !== null ? value.toString().padStart(2, '0') : '—'}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// Subjects View — add/remove subjects after onboarding
// ═══════════════════════════════════════════════════════════

function SubjectsView() {
  const profile = useAbiturStore((s) => s.profile);
  const { setSubjects } = useAbiturStore();

  const grouped = useMemo(() => {
    const cats: Record<string, SubjectDefinition[]> = {};
    ALL_SUBJECTS.forEach((s) => {
      if (MANDATORY_IDS.includes(s.id)) return;
      if (!cats[s.category]) cats[s.category] = [];
      cats[s.category].push(s);
    });
    return cats;
  }, []);

  const toggle = (id: string) => {
    if (MANDATORY_IDS.includes(id)) return;
    // Don't allow removing LF or exam subjects
    if (id === profile.leistungsfach) return;
    if (profile.examSubjects.includes(id)) return;

    if (profile.subjects.includes(id)) {
      setSubjects(profile.subjects.filter((s) => s !== id));
    } else {
      setSubjects(applyExclusivity([...profile.subjects, id], id));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[13px] font-medium">Fächer verwalten</p>
        <p className="text-[11px] text-muted-foreground/40 mt-1">
          {profile.subjects.length} Fächer gewählt · Pflicht-, LF- und Prüfungsfächer können nicht entfernt werden
        </p>
      </div>

      {/* Currently selected — Pflicht */}
      <SGroup title="Pflichtfächer (fest)">
        {MANDATORY_IDS.map((id) => {
          const s = getSubject(id);
          if (!s) return null;
          return (
            <div key={id} className="flex items-center gap-3 px-4 py-3">
              <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center text-[9px] font-bold font-mono shrink-0', FIELD_BG[s.field], FIELD_COLOR[s.field])}>
                {s.shortName}
              </div>
              <span className="text-[12px] font-medium flex-1">{s.name}</span>
              <Lock className="h-3 w-3 text-muted-foreground/20" />
            </div>
          );
        })}
      </SGroup>

      {/* Optional subjects by category */}
      {Object.entries(grouped).map(([cat, subs]) => (
        <SGroup key={cat} title={CAT_LABELS[cat] || cat}>
          {subs.map((s) => {
            const active = profile.subjects.includes(s.id);
            const locked = s.id === profile.leistungsfach || profile.examSubjects.includes(s.id);
            // Show which exclusive subject would be replaced
            const exclusiveGroup = EXCLUSIVE_GROUPS.find((g) => g.includes(s.id));
            const wouldReplace = !active && exclusiveGroup
              ? exclusiveGroup.find((id) => id !== s.id && profile.subjects.includes(id))
              : undefined;
            const replaceName = wouldReplace ? getSubject(wouldReplace)?.shortName : undefined;
            return (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                disabled={locked}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                  active ? 'hover:bg-foreground/[0.02]' : 'opacity-40 hover:opacity-60',
                  locked && 'cursor-not-allowed'
                )}
              >
                <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center text-[9px] font-bold font-mono shrink-0', FIELD_BG[s.field], FIELD_COLOR[s.field])}>
                  {s.shortName}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-medium truncate">{s.name}</span>
                    {s.lateStart && (
                      <span className="text-[7px] text-amber-500 bg-amber-500/10 px-1 py-0.5 rounded font-medium shrink-0">spät</span>
                    )}
                    {s.requiresAdditum && (
                      <span className="text-[7px] text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded font-medium shrink-0">Add.</span>
                    )}
                  </div>
                  {replaceName && (
                    <span className="text-[9px] text-amber-500/50">Ersetzt {replaceName}</span>
                  )}
                </div>
                {locked ? (
                  <Lock className="h-3 w-3 text-muted-foreground/20" />
                ) : active ? (
                  <div className="h-5 w-5 rounded-[5px] bg-emerald-500 border border-emerald-500 flex items-center justify-center">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                ) : (
                  <div className="h-5 w-5 rounded-[5px] border border-border/50" />
                )}
              </button>
            );
          })}
        </SGroup>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Einbringungen View — overview + toggle across all semesters
// ═══════════════════════════════════════════════════════════

function EinbringungenView({ profile }: { profile: AbiturProfile }) {
  const { toggleEinbringung, autoOptimizeEinbringungen } = useAbiturStore();
  const einCount = countAllEinbringungen(profile);
  const subjects = profile.subjects.filter((id) => id !== 'psem');
  const rules = getAllEinbringungRules(profile);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[13px] font-medium">Einbringungen verwalten</p>
        <p className="text-[11px] text-muted-foreground/40 mt-1">
          Wähle welche Halbjahresleistungen in Block I eingehen
        </p>
      </div>

      {/* Counter bar */}
      <div className="rounded-2xl border border-border/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-muted-foreground/30 uppercase tracking-widest">Gesamt</span>
          <span className={cn('text-[13px] font-bold tabular-nums', einCount >= 40 ? 'text-emerald-500' : einCount < 40 ? 'text-amber-500' : 'text-foreground')}>
            {einCount}<span className="text-muted-foreground/30 font-normal"> / 40</span>
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-foreground/[0.05] overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700', einCount >= 40 ? 'bg-emerald-500' : 'bg-amber-500')}
            style={{ width: `${Math.min(100, (einCount / 40) * 100)}%` }}
          />
        </div>
        {einCount < 40 && (
          <p className="text-[10px] text-amber-500/60 mt-2">
            Noch {40 - einCount} Einbringungen nötig
          </p>
        )}
      </div>

      {/* Auto-optimize button */}
      <button
        onClick={autoOptimizeEinbringungen}
        className="w-full flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 text-[12px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/[0.08] transition-colors active:scale-[0.98]"
      >
        <Wand2 className="h-3.5 w-3.5" />
        Automatisch optimieren
      </button>

      {/* Streichung / Einbringung Rules Summary */}
      <div className="rounded-2xl border border-border/40 p-4 space-y-3">
        <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest">Streichungsregeln</p>
        
        {/* Pflicht — cannot drop */}
        {(() => {
          const pflicht = rules.filter((r) => r.category === 'pflicht');
          const wahlpflicht = rules.filter((r) => r.category === 'wahlpflicht');
          const optional = rules.filter((r) => r.category === 'optional');
          return (
            <div className="space-y-3">
              {pflicht.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Lock className="h-3 w-3 text-red-400" />
                    <span className="text-[10px] font-medium text-red-400">Pflicht — alle 4 HJ zählen</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {pflicht.map((r) => {
                      const s = getSubject(r.subjectId);
                      return (
                        <span key={r.subjectId} className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-md font-medium" title={r.reason}>
                          {s?.shortName || r.subjectId}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {wahlpflicht.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <CircleDot className="h-3 w-3 text-amber-500" />
                    <span className="text-[10px] font-medium text-amber-500">Wahlpflicht — teilweise streichbar</span>
                  </div>
                  <div className="space-y-1">
                    {wahlpflicht.map((r) => {
                      const s = getSubject(r.subjectId);
                      const currentEin = SEMESTERS.filter((sem) => isEingebracht(r.subjectId, sem, profile)).length;
                      const droppable = Math.max(0, currentEin - r.minSemesters);
                      return (
                        <div key={r.subjectId} className="flex items-center gap-2 text-[10px]">
                          <span className={cn(
                            'px-2 py-0.5 rounded-md font-medium',
                            droppable === 0 ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-500'
                          )}>{s?.shortName || r.subjectId}</span>
                          <span className="text-muted-foreground/30">
                            {r.reason} — <span className={droppable === 0 ? 'text-red-400/70' : 'text-amber-500/70'}>
                              {droppable > 0 ? `noch ${droppable} streichbar` : 'keine Streichung mehr möglich'}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {optional.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="h-3 w-3 text-emerald-500" />
                    <span className="text-[10px] font-medium text-emerald-500">Optional — nur wenn sie helfen</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {optional.map((r) => {
                      const s = getSubject(r.subjectId);
                      return (
                        <span key={r.subjectId} className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-md font-medium" title={r.reason}>
                          {s?.shortName || r.subjectId}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Global Constraints Summary */}
      {(() => {
        // Count total foreign language einbringungen
        const allLanguages = profile.subjects.filter((id) => {
          const s = getSubject(id);
          return s && s.category === 'language' && id !== 'deu';
        });
        let totalFSEinbringungen = 0;
        for (const langId of allLanguages) {
          for (const sem of SEMESTERS) {
            if (isEingebracht(langId, sem, profile)) totalFSEinbringungen++;
          }
        }

        // Count total natural science einbringungen
        const allSciences = profile.subjects.filter((id) => {
          const s = getSubject(id);
          return s && s.category === 'stem' && id !== 'mat' && id !== 'inf';
        });
        let totalNWEinbringungen = 0;
        for (const sciId of allSciences) {
          for (const sem of SEMESTERS) {
            if (isEingebracht(sciId, sem, profile)) totalNWEinbringungen++;
          }
        }

        if (allLanguages.length > 1 || allSciences.length > 1) {
          return (
            <div className="rounded-2xl border border-border/40 p-4 space-y-2">
              <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest">Globale Mindestanforderungen</p>
              {allLanguages.length > 1 && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground/50">Fremdsprachen gesamt</span>
                  <span className={cn('font-mono font-bold', totalFSEinbringungen >= 4 ? 'text-emerald-500' : 'text-red-400')}>
                    {totalFSEinbringungen}/4 HJ
                  </span>
                </div>
              )}
              {allSciences.length > 1 && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground/50">Naturwissenschaften gesamt</span>
                  <span className={cn('font-mono font-bold', totalNWEinbringungen >= 4 ? 'text-emerald-500' : 'text-red-400')}>
                    {totalNWEinbringungen}/4 HJ
                  </span>
                </div>
              )}
              <p className="text-[9px] text-muted-foreground/25 pt-1">
                {allLanguages.length > 1 && 'Mind. 4 HJ Fremdsprachen insgesamt. '}
                {allSciences.length > 1 && 'Mind. 4 HJ Naturwissenschaften insgesamt (Phy/Che/Bio).'}
              </p>
            </div>
          );
        }
        return null;
      })()}

      {/* Subject × Semester grid */}
      <div className="rounded-2xl border border-border/40 overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-0 border-b border-border/30 bg-foreground/[0.02]">
          <div className="w-[140px] px-4 py-2.5">
            <span className="text-[9px] text-muted-foreground/30 uppercase tracking-widest">Fach</span>
          </div>
          {SEMESTERS.map((sem) => (
            <div key={sem} className="flex-1 text-center py-2.5">
              <span className="text-[9px] text-muted-foreground/30 uppercase tracking-widest">{SEMESTER_LABELS[sem]}</span>
            </div>
          ))}
        </div>

        {/* Subject rows */}
        {subjects.map((subjectId) => {
          const subj = getSubject(subjectId);
          if (!subj) return null;
          const mandatory = isMandatory(subjectId, profile);
          const toggleable = canToggle(subjectId, profile);
          const rule = getEinbringungRule(subjectId, profile);
          // Count current eingebracht semesters for this subject
          const currentEingebracht = SEMESTERS.filter((s) => isEingebracht(subjectId, s, profile)).length;
          const droppable = Math.max(0, currentEingebracht - rule.minSemesters);

          return (
            <div key={subjectId} className="flex items-center gap-0 border-b border-border/30 last:border-b-0">
              <div className="w-[140px] px-4 py-2.5 flex items-center gap-2">
                <div className={cn('h-5 w-5 rounded flex items-center justify-center text-[8px] font-bold font-mono shrink-0', FIELD_BG[subj.field], FIELD_COLOR[subj.field])}>
                  {subj.shortName}
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] truncate block">{subj.name}</span>
                  <span className={cn(
                    'text-[8px] block',
                    rule.category === 'pflicht' ? 'text-red-400/50'
                      : droppable === 0 && rule.category === 'wahlpflicht' ? 'text-red-400/50'
                      : rule.category === 'wahlpflicht' ? 'text-amber-500/50'
                      : 'text-emerald-500/50'
                  )}>
                    {rule.category === 'pflicht'
                      ? '4/4 Pflicht'
                      : rule.category === 'wahlpflicht'
                        ? `${currentEingebracht}/${rule.minSemesters} min · ${droppable > 0 ? `${droppable} streichbar` : 'keine Streichung mehr'}`
                        : 'Optional'}
                  </span>
                </div>
              </div>
              {SEMESTERS.map((sem) => {
                const grade = (profile.grades ?? []).find((g) => g.subjectId === subjectId && g.semester === sem);
                const pts = grade?.points ?? null;
                const eingebracht = isEingebracht(subjectId, sem, profile);
                const dropCheck = canDropSemester(subjectId, sem, profile);
                const addCheck = canAddSemester(subjectId, sem, profile);
                const canToggleThis = toggleable && (eingebracht ? dropCheck.canDrop : addCheck.canAdd);
                const blockReason = eingebracht ? dropCheck.reason : addCheck.reason;

                return (
                  <div key={sem} className="flex-1 flex justify-center py-2.5">
                    <button
                      onClick={() => canToggleThis && toggleEinbringung(subjectId, sem)}
                      disabled={!canToggleThis}
                      title={!canToggleThis && !mandatory ? blockReason : undefined}
                      className={cn(
                        'h-7 w-10 rounded-lg flex items-center justify-center text-[11px] font-mono font-bold transition-all',
                        eingebracht
                          ? (mandatory || (!dropCheck.canDrop && toggleable))
                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500'
                            : 'bg-emerald-500 text-white'
                          : pts !== null
                            ? !addCheck.canAdd && toggleable
                              ? 'bg-amber-500/5 border border-amber-500/20 text-muted-foreground/20 cursor-not-allowed'
                              : 'bg-foreground/[0.03] text-muted-foreground/25 hover:border-emerald-500/30 border border-transparent'
                            : 'text-muted-foreground/10',
                        !canToggleThis && 'cursor-not-allowed'
                      )}
                    >
                      {pts !== null ? pts.toString().padStart(2, '0') : '·'}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground/25">
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-6 rounded bg-emerald-500 text-[8px] text-white font-mono flex items-center justify-center">08</div>
          <span>Eingebracht</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-6 rounded bg-emerald-500/10 border border-emerald-500/20 text-[8px] text-emerald-500 font-mono flex items-center justify-center">08</div>
          <span>Pflicht</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-6 rounded bg-foreground/[0.03] text-[8px] text-muted-foreground/25 font-mono flex items-center justify-center">08</div>
          <span>Gestrichen</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Exams Section
// ═══════════════════════════════════════════════════════════

function ExamsSection({ profile }: { profile: AbiturProfile }) {
  const { setExamPoints } = useAbiturStore();

  return (
    <div>
      <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest mb-3">Abiturprüfungen</p>
      <div className="rounded-2xl border border-border/40 divide-y divide-border/30">
        {profile.exams.map((exam, i) => {
          const s = getSubject(exam.subjectId);
          if (!s) return (
            <div key={i} className="flex items-center justify-between px-4 py-3 text-[12px] text-muted-foreground/25">
              <span>{i + 1}. Prüfung — nicht gewählt</span>
            </div>
          );
          return (
            <div key={exam.subjectId} className="flex items-center gap-3 px-4 py-3">
              <div className={cn(
                'h-7 w-7 rounded-lg flex items-center justify-center text-[9px] font-bold font-mono shrink-0',
                FIELD_BG[s.field], FIELD_COLOR[s.field]
              )}>
                {s.shortName}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium truncate">{s.name}</p>
                <p className="text-[10px] text-muted-foreground/30">
                  {exam.examType === 'written' ? 'Schriftlich' : 'Kolloquium'}
                </p>
              </div>
              <PointsInput value={exam.points} onChange={(v) => setExamPoints(exam.subjectId, v)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Settings View
// ═══════════════════════════════════════════════════════════

function SettingsView() {
  const profile = useAbiturStore((s) => s.profile);
  const {
    setStudentName, setSchoolYear, setCurrentSemester, setLeistungsfach,
    setExamSubject, setSeminarTopic, setSeminarPaperPoints,
    setSeminarPresentationPoints, resetProfile, setSubstitutedWritten,
  } = useAbiturStore();

  const [confirmReset, setConfirmReset] = useState(false);
  const lfOptions = ALL_SUBJECTS.filter((s) => s.canBeLF && profile.subjects.includes(s.id));

  return (
    <div className="space-y-6">
      <SGroup title="Persönlich">
        <SField label="Name">
          <input
            value={profile.studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="Dein Name"
            className="w-full bg-transparent text-[13px] text-right outline-none placeholder:text-muted-foreground/20"
          />
        </SField>
        <SField label="Schuljahr">
          <input
            value={profile.schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            placeholder="2025/2027"
            className="w-full bg-transparent text-[13px] text-right outline-none placeholder:text-muted-foreground/20 font-mono"
          />
        </SField>
        <SField label="Aktuelles Halbjahr">
          <select
            value={profile.currentSemester}
            onChange={(e) => setCurrentSemester(e.target.value as Semester)}
            className="bg-transparent text-[13px] outline-none text-right"
          >
            {SEMESTERS.map((s) => (
              <option key={s} value={s}>{SEMESTER_LABELS[s]}</option>
            ))}
          </select>
        </SField>
      </SGroup>

      <SGroup title="Leistungsfach">
        <SField label="3. Schriftliches">
          <select
            value={profile.leistungsfach}
            onChange={(e) => setLeistungsfach(e.target.value)}
            className="bg-transparent text-[13px] outline-none text-right"
          >
            {lfOptions.map((s) => {
              const v = canSubjectBeLF(s.id);
              return (
                <option key={s.id} value={s.id} disabled={!v.valid}>
                  {s.name}{!v.valid ? ` (${v.reason})` : s.requiresAdditum ? ' (Additum)' : ''}
                </option>
              );
            })}
          </select>
        </SField>
      </SGroup>

      <SGroup title="Prüfungsfächer">
        {profile.examSubjects.map((sid, i) => {
          // Determine which subjects are unavailable for this slot
          const otherKolloq = i === 3 ? profile.examSubjects[4] : i === 4 ? profile.examSubjects[3] : '';
          const usedIds = new Set(['deu', 'mat', profile.leistungsfach, 'wsem', 'psem']);
          if (otherKolloq) usedIds.add(otherKolloq);

          return (
            <SField key={i} label={`${i + 1}. ${i < 3 ? 'Schriftl.' : 'Kolloquium'}`}>
              {i < 3 ? (
                <span className="text-[13px] text-muted-foreground/50">{getSubject(sid)?.name || '—'}</span>
              ) : (
                <select
                  value={sid}
                  onChange={(e) => setExamSubject(i, e.target.value)}
                  className="bg-transparent text-[13px] outline-none text-right"
                >
                  <option value="">Wählen...</option>
                  {profile.subjects
                    .filter((id) => !usedIds.has(id))
                    .map((id) => {
                      const s = getSubject(id);
                      if (!s) return null;
                      const oral = canSubjectBeOralExam(id);
                      // Check exclusive group conflict with the other Kolloquium
                      const exclusiveConflict = otherKolloq
                        ? EXCLUSIVE_GROUPS.some((g) => g.includes(id) && g.includes(otherKolloq))
                        : false;
                      const disabled = !oral.valid || exclusiveConflict;
                      return (
                        <option key={id} value={id} disabled={disabled}>
                          {s.name}{disabled ? ` (${oral.reason || 'Konflikt'})` : ''}
                        </option>
                      );
                    })}
                </select>
              )}
            </SField>
          );
        })}
        {/* Validation feedback */}
        {(() => {
          const exam4 = profile.examSubjects[3] || '';
          const exam5 = profile.examSubjects[4] || '';
          if (!exam4 && !exam5) return null;
          const validation = validateExamCombination(
            profile.leistungsfach, exam4, exam5, profile.substitutedWritten ?? null
          );
          if (validation.valid && validation.warnings.length === 0) return null;
          return (
            <div className="px-4 py-3 space-y-1">
              {validation.errors.map((err, i) => (
                <p key={i} className="text-[10px] text-red-400 flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5 shrink-0" />{err}
                </p>
              ))}
              {validation.warnings.map((w, i) => (
                <p key={i} className="text-[10px] text-amber-500/70 flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5 shrink-0" />{w}
                </p>
              ))}
            </div>
          );
        })()}
      </SGroup>

      {/* Joker / Substitution Rule */}
      <SGroup title="Joker-Regel">
        <div className="px-4 py-3 space-y-2">
          <p className="text-[11px] text-muted-foreground/40 leading-relaxed">
            Ersetze Deutsch oder Mathe als Pflicht-Schriftliche. Voraussetzung: 2 fortgeführte FS (für Deutsch) oder 2 NW (für Mathe).
          </p>
          <div className="flex items-center gap-2">
            {([null, 'deu', 'mat'] as const).map((opt) => (
              <button
                key={opt ?? 'none'}
                onClick={() => setSubstitutedWritten(opt)}
                className={cn(
                  'flex-1 rounded-xl py-2 text-[11px] font-medium transition-all border',
                  (profile.substitutedWritten ?? null) === opt
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'border-border/40 text-muted-foreground/40 hover:text-foreground/70'
                )}
              >
                {opt === null ? 'Kein Joker' : opt === 'deu' ? 'Deutsch ersetzen' : 'Mathe ersetzen'}
              </button>
            ))}
          </div>
          {profile.substitutedWritten && (
            <p className="text-[10px] text-amber-500/60 flex items-center gap-1">
              <Replace className="h-3 w-3" />
              {profile.substitutedWritten === 'deu'
                ? 'Deutsch wird als mündliches Prüfungsfach (Kolloquium) abgelegt'
                : 'Mathematik wird als mündliches Prüfungsfach (Kolloquium) abgelegt'
              }
            </p>
          )}
        </div>
      </SGroup>

      <SGroup title="W-Seminar">
        <SField label="Thema">
          <input
            value={profile.seminarTopicTitle}
            onChange={(e) => setSeminarTopic(e.target.value)}
            placeholder="Seminarthema"
            className="w-full bg-transparent text-[13px] text-right outline-none placeholder:text-muted-foreground/20"
          />
        </SField>
        <SField label="Seminararbeit">
          <PointsInput value={profile.seminarPaperPoints} onChange={setSeminarPaperPoints} />
        </SField>
        <SField label="Präsentation">
          <PointsInput value={profile.seminarPresentationPoints} onChange={setSeminarPresentationPoints} />
        </SField>
      </SGroup>

      <div className="rounded-2xl border border-red-500/10 p-4">
        {confirmReset ? (
          <div className="flex items-center gap-3">
            <p className="text-[12px] text-red-400 flex-1">Alle Daten unwiderruflich löschen?</p>
            <button
              onClick={() => { resetProfile(); setConfirmReset(false); }}
              className="text-[12px] font-medium text-red-500 bg-red-500/10 px-3 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors"
            >
              Löschen
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="text-[12px] text-muted-foreground/40 hover:text-foreground transition-colors"
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="text-[12px] text-red-400 hover:text-red-300 transition-colors"
          >
            Alle Daten zurücksetzen
          </button>
        )}
      </div>
    </div>
  );
}

function SGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] text-muted-foreground/30 uppercase tracking-widest mb-2">{title}</p>
      <div className="rounded-2xl border border-border/40 divide-y divide-border/30">
        {children}
      </div>
    </div>
  );
}

function SField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-[12px] text-muted-foreground/50">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}
