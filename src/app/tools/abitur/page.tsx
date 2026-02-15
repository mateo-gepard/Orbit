'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  GraduationCap,
  ArrowLeft,
  ChevronRight,
  Check,
  X,
  Plus,
  Target,
  BarChart3,
  BookOpen,
  Shield,
  AlertTriangle,
  TrendingUp,
  Calculator,
  Lock,
  Unlock,
  Settings,
  Sparkles,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAbiturStore } from '@/lib/abitur-store';
import {
  SUBJECT_TEMPLATES,
  HALBJAHRE,
  hasSchulaufgabe,
  computeHalbjahresleistung,
  computeEinbringung,
  computeBlockII,
  pointsToGrade,
  gradeToString,
  runQualificationChecks,
  whatDoINeedForGrade,
  whatSADoINeed,
  pointsColor,
  type SubjectDefinition,
  type Halbjahr,
  type GradeEntry,
} from '@/lib/abitur';

// ═══════════════════════════════════════════════════════════
// ABITUR SCORE TOOL — Bayern G9
// ═══════════════════════════════════════════════════════════

export default function AbiturPage() {
  const store = useAbiturStore();

  // Rehydrate persisted store on mount
  useEffect(() => {
    useAbiturStore.persist.rehydrate();
  }, []);

  if (!store.isSetupComplete) {
    return <SetupWizard />;
  }

  switch (store.currentView) {
    case 'halbjahr':
      return <HalbjahrView />;
    case 'subject':
      return <SubjectDetailView />;
    case 'einbringung':
      return <EinbringungView />;
    case 'exams':
      return <ExamsView />;
    default:
      return <DashboardView />;
  }
}

// ═══════════════════════════════════════════════════════════
// SETUP WIZARD
// ═══════════════════════════════════════════════════════════

function SetupWizard() {
  const { completeSetup } = useAbiturStore();
  const [step, setStep] = useState(0);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([
    'Deutsch', 'Mathematik', 'Englisch', 'Geschichte',
    'Politik und Gesellschaft', 'Sport',
  ]);
  const [leistungsfach, setLeistungsfach] = useState<string>('');
  const [abiturFaecher, setAbiturFaecher] = useState<string[]>([]);
  const [onlyFremdsprache, setOnlyFremdsprache] = useState<string>('');
  const [onlyNaWi, setOnlyNaWi] = useState<string>('');
  const [wrGeo, setWrGeo] = useState<string>('');

  const selectedTemplates = SUBJECT_TEMPLATES.filter((t) =>
    selectedSubjects.includes(t.name)
  );

  const fremdsprachen = selectedTemplates.filter(
    (t) => t.category === 'fremdsprache'
  );
  const naturwissenschaften = selectedTemplates.filter(
    (t) => t.category === 'naturwissenschaft'
  );
  const wrGeoOptions = selectedTemplates.filter(
    (t) => t.name === 'Wirtschaft und Recht' || t.name === 'Geographie'
  );
  const pugOption = selectedTemplates.find(
    (t) => t.name === 'Politik und Gesellschaft'
  );

  const handleFinish = () => {
    // Build SubjectDefinition[]
    const subjects: SubjectDefinition[] = selectedTemplates.map((t, i) => ({
      id: `sub_${i}_${t.shortName}`,
      name: t.name,
      shortName: t.shortName,
      category: t.category,
      aufgabenfeld: t.aufgabenfeld,
      isLeistungsfach: t.name === leistungsfach,
      isAbiturFach: abiturFaecher.includes(t.name) || t.name === leistungsfach,
      abiturFachNr: t.name === leistungsfach
        ? 1
        : abiturFaecher.indexOf(t.name) >= 0
          ? abiturFaecher.indexOf(t.name) + 2
          : null,
    }));

    const onlyFS = fremdsprachen.length === 1
      ? subjects.find((s) => s.category === 'fremdsprache')?.id ?? null
      : onlyFremdsprache
        ? subjects.find((s) => s.name === onlyFremdsprache)?.id ?? null
        : null;

    const onlyNW = naturwissenschaften.length === 1
      ? subjects.find((s) => s.category === 'naturwissenschaft')?.id ?? null
      : onlyNaWi
        ? subjects.find((s) => s.name === onlyNaWi)?.id ?? null
        : null;

    const pugId = subjects.find((s) => s.name === 'Politik und Gesellschaft')?.id ?? null;
    const wrGeoId = wrGeo ? subjects.find((s) => s.name === wrGeo)?.id ?? null : null;

    completeSetup(subjects, {
      onlyFortgefuehrteFremdsprache: onlyFS,
      onlyFortgefuehrteNaturwissenschaft: onlyNW,
      pugSubjectId: pugId,
      wrGeoSubjectId: wrGeoId,
    });
  };

  const toggleAbiturFach = (name: string) => {
    if (name === leistungsfach) return;
    setAbiturFaecher((prev) =>
      prev.includes(name)
        ? prev.filter((n) => n !== name)
        : prev.length < 4
          ? [...prev, name]
          : prev
    );
  };

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-violet-500" strokeWidth={1.5} />
        <h1 className="text-xl font-semibold tracking-tight">Abitur Setup</h1>
      </div>

      <p className="text-[13px] text-muted-foreground/50">
        Richte dein Abitur ein. Du kannst später alles ändern.
      </p>

      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((s) => (
          <div
            key={s}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              s <= step ? 'bg-violet-500' : 'bg-foreground/[0.06]'
            )}
          />
        ))}
      </div>

      {/* Step 0: Subject Selection */}
      {step === 0 && (
        <div className="space-y-4">
          <p className="text-[14px] font-semibold">Fächer auswählen</p>
          <p className="text-[12px] text-muted-foreground/40">
            Wähle alle Fächer, die du in der Oberstufe belegst. Deutsch und Mathe sind Pflicht.
          </p>

          <div className="space-y-3">
            {(['SLK', 'GPR', 'MINT', null] as const).map((feld) => {
              const group = SUBJECT_TEMPLATES.filter((t) =>
                feld === null
                  ? t.aufgabenfeld === null
                  : t.aufgabenfeld === feld
              );
              const label = feld === 'SLK'
                ? 'Sprachlich-literarisch-künstlerisch'
                : feld === 'GPR'
                  ? 'Gesellschaftswissenschaftlich'
                  : feld === 'MINT'
                    ? 'Mathematisch-naturwissenschaftlich'
                    : 'Weitere';
              return (
                <div key={feld ?? 'other'}>
                  <p className="text-[10px] text-muted-foreground/30 uppercase tracking-wider mb-1.5">
                    {label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.map((t) => {
                      const isSelected = selectedSubjects.includes(t.name);
                      const isRequired = t.name === 'Deutsch' || t.name === 'Mathematik';
                      return (
                        <button
                          key={t.name}
                          onClick={() => {
                            if (isRequired) return;
                            setSelectedSubjects((prev) =>
                              isSelected
                                ? prev.filter((n) => n !== t.name)
                                : [...prev, t.name]
                            );
                          }}
                          className={cn(
                            'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all border',
                            isSelected
                              ? 'bg-violet-500/10 border-violet-500/25 text-violet-600 dark:text-violet-400'
                              : 'border-border/40 text-muted-foreground/50 hover:border-border/60',
                            isRequired && 'opacity-70 cursor-not-allowed'
                          )}
                        >
                          {t.shortName}
                          {isRequired && ' ✓'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setStep(1)}
            disabled={selectedSubjects.length < 6}
            className="w-full rounded-2xl py-3 text-[13px] font-semibold bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Weiter — Leistungsfach & Abiturfächer
          </button>
        </div>
      )}

      {/* Step 1: Leistungsfach + Abiturfächer */}
      {step === 1 && (
        <div className="space-y-4">
          <button
            onClick={() => setStep(0)}
            className="flex items-center gap-1 text-[12px] text-muted-foreground/40 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Zurück
          </button>

          <div>
            <p className="text-[14px] font-semibold">Leistungsfach (erhöhtes Anforderungsniveau)</p>
            <p className="text-[12px] text-muted-foreground/40 mt-0.5">
              Dein Leistungsfach wird automatisch als 1. Abiturfach gesetzt.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {selectedTemplates
                .filter((t) => t.category !== 'wseminar' && t.category !== 'pseminar' && t.category !== 'sport')
                .map((t) => (
                  <button
                    key={t.name}
                    onClick={() => setLeistungsfach(t.name)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all border',
                      leistungsfach === t.name
                        ? 'bg-violet-500/10 border-violet-500/25 text-violet-600 dark:text-violet-400'
                        : 'border-border/40 text-muted-foreground/50 hover:border-border/60'
                    )}
                  >
                    {t.shortName}
                  </button>
                ))}
            </div>
          </div>

          {leistungsfach && (
            <div>
              <p className="text-[14px] font-semibold">
                Weitere Abiturfächer (wähle 4 weitere)
              </p>
              <p className="text-[12px] text-muted-foreground/40 mt-0.5">
                Insgesamt 5 Abiturfächer. Aus allen 3 Aufgabenfeldern.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {selectedTemplates
                  .filter(
                    (t) =>
                      t.name !== leistungsfach &&
                      t.category !== 'wseminar' &&
                      t.category !== 'pseminar'
                  )
                  .map((t) => {
                    const isAbi = abiturFaecher.includes(t.name);
                    return (
                      <button
                        key={t.name}
                        onClick={() => toggleAbiturFach(t.name)}
                        className={cn(
                          'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all border',
                          isAbi
                            ? 'bg-violet-500/10 border-violet-500/25 text-violet-600 dark:text-violet-400'
                            : 'border-border/40 text-muted-foreground/50 hover:border-border/60'
                        )}
                      >
                        {t.shortName}
                        {isAbi && ` (${abiturFaecher.indexOf(t.name) + 2})`}
                      </button>
                    );
                  })}
              </div>

              {/* Aufgabenfeld coverage check */}
              {abiturFaecher.length === 4 && (
                <div className="mt-3">
                  {(() => {
                    const allAbiNames = [leistungsfach, ...abiturFaecher];
                    const fields = new Set(
                      allAbiNames
                        .map((n) => SUBJECT_TEMPLATES.find((t) => t.name === n)?.aufgabenfeld)
                        .filter(Boolean)
                    );
                    const covered = fields.size >= 3;
                    return (
                      <p
                        className={cn(
                          'text-[11px] font-medium',
                          covered ? 'text-emerald-500' : 'text-red-400'
                        )}
                      >
                        {covered
                          ? '✓ Alle 3 Aufgabenfelder abgedeckt'
                          : '✗ Nicht alle 3 Aufgabenfelder abgedeckt'}
                      </p>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setStep(2)}
            disabled={!leistungsfach || abiturFaecher.length < 4}
            className="w-full rounded-2xl py-3 text-[13px] font-semibold bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Weiter — Einbringungsregeln
          </button>
        </div>
      )}

      {/* Step 2: Einbringung config */}
      {step === 2 && (
        <div className="space-y-4">
          <button
            onClick={() => setStep(1)}
            className="flex items-center gap-1 text-[12px] text-muted-foreground/40 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Zurück
          </button>

          <p className="text-[14px] font-semibold">Einbringungsregeln</p>

          {fremdsprachen.length > 1 && (
            <div>
              <p className="text-[12px] text-muted-foreground/50 mb-2">
                Welche ist deine einzige fortgeführte Fremdsprache? (4 Halbjahre Pflicht)
              </p>
              <div className="flex gap-2">
                {fremdsprachen.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => setOnlyFremdsprache(t.name)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all border',
                      onlyFremdsprache === t.name
                        ? 'bg-violet-500/10 border-violet-500/25 text-violet-600 dark:text-violet-400'
                        : 'border-border/40 text-muted-foreground/50'
                    )}
                  >
                    {t.shortName}
                  </button>
                ))}
                <button
                  onClick={() => setOnlyFremdsprache('')}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all border',
                    onlyFremdsprache === ''
                      ? 'bg-violet-500/10 border-violet-500/25 text-violet-600 dark:text-violet-400'
                      : 'border-border/40 text-muted-foreground/50'
                  )}
                >
                  Keine (mehrere fortgeführt)
                </button>
              </div>
            </div>
          )}

          {naturwissenschaften.length > 1 && (
            <div>
              <p className="text-[12px] text-muted-foreground/50 mb-2">
                Welche ist deine einzige fortgeführte Naturwissenschaft? (4 Halbjahre Pflicht)
              </p>
              <div className="flex gap-2">
                {naturwissenschaften.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => setOnlyNaWi(t.name)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all border',
                      onlyNaWi === t.name
                        ? 'bg-violet-500/10 border-violet-500/25 text-violet-600 dark:text-violet-400'
                        : 'border-border/40 text-muted-foreground/50'
                    )}
                  >
                    {t.shortName}
                  </button>
                ))}
                <button
                  onClick={() => setOnlyNaWi('')}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all border',
                    onlyNaWi === ''
                      ? 'bg-violet-500/10 border-violet-500/25 text-violet-600 dark:text-violet-400'
                      : 'border-border/40 text-muted-foreground/50'
                  )}
                >
                  Keine (mehrere fortgeführt)
                </button>
              </div>
            </div>
          )}

          {wrGeoOptions.length > 0 && (
            <div>
              <p className="text-[12px] text-muted-foreground/50 mb-2">
                Welches Fach erfüllt die Belegungsverpflichtung WR/Geo? (3 HJL Pflicht)
              </p>
              <div className="flex gap-2">
                {wrGeoOptions.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => setWrGeo(t.name)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all border',
                      wrGeo === t.name
                        ? 'bg-violet-500/10 border-violet-500/25 text-violet-600 dark:text-violet-400'
                        : 'border-border/40 text-muted-foreground/50'
                    )}
                  >
                    {t.shortName}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleFinish}
            className="w-full rounded-2xl py-3.5 text-[14px] font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-all active:scale-[0.98] shadow-lg shadow-violet-600/20"
          >
            <Sparkles className="h-4 w-4 inline mr-2" />
            Abitur starten
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════

function DashboardView() {
  const store = useAbiturStore();
  const { subjects, grades, exams, einbringungStrategy, lockedSlots, targetGrade } = store;

  // Compute Block I
  const blockI = useMemo(
    () =>
      computeEinbringung({
        subjects,
        grades,
        lockedSlots: new Set(lockedSlots),
        strategy: einbringungStrategy,
        onlyFortgefuehrteFremdsprache: store.onlyFortgefuehrteFremdsprache,
        onlyFortgefuehrteNaturwissenschaft: store.onlyFortgefuehrteNaturwissenschaft,
        pugSubjectId: store.pugSubjectId,
        wrGeoSubjectId: store.wrGeoSubjectId,
      }),
    [subjects, grades, lockedSlots, einbringungStrategy, store.onlyFortgefuehrteFremdsprache, store.onlyFortgefuehrteNaturwissenschaft, store.pugSubjectId, store.wrGeoSubjectId]
  );

  const blockII = useMemo(() => computeBlockII(exams), [exams]);
  const totalPoints = blockI.totalPoints + blockII.totalPoints;
  const abiturGrade = pointsToGrade(totalPoints);
  const checks = useMemo(
    () => runQualificationChecks(blockI, blockII, subjects, grades),
    [blockI, blockII, subjects, grades]
  );
  const passedChecks = checks.filter((c) => c.passed).length;

  // Averages
  const allGradesFlat = useMemo(() => {
    const result: number[] = [];
    for (const sub of subjects) {
      for (const hj of HALBJAHRE) {
        const entry = grades[sub.id]?.[hj];
        if (!entry) continue;
        const hasSA = hasSchulaufgabe(sub, hj);
        const r = computeHalbjahresleistung(entry, hasSA);
        if (r.source !== 'expected' || r.points > 0) result.push(r.points);
      }
    }
    return result;
  }, [subjects, grades]);

  const overallAvg =
    allGradesFlat.length > 0
      ? allGradesFlat.reduce((a, b) => a + b, 0) / allGradesFlat.length
      : 0;
  const einbringungAvg =
    blockI.slots.length > 0
      ? blockI.totalPoints / blockI.slots.length
      : 0;

  // "What do I need?" calculation
  const whatINeed = useMemo(
    () => whatDoINeedForGrade(targetGrade, blockI, blockII),
    [targetGrade, blockI, blockII]
  );

  // Count actual vs expected grades
  const actualCount = allGradesFlat.length;
  const totalPossible = subjects.length * 4;
  const confidence = totalPossible > 0 ? actualCount / totalPossible : 0;

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-violet-500" strokeWidth={1.5} />
          <h1 className="text-xl font-semibold tracking-tight">Abitur</h1>
        </div>
        <button
          onClick={() => {
            if (confirm('Setup zurücksetzen? Alle Daten werden gelöscht.')) {
              store.resetSetup();
            }
          }}
          className="text-muted-foreground/30 hover:text-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {/* Hero Score */}
      <div className="text-center py-4">
        <p className="text-6xl font-black tabular-nums tracking-tight">
          {gradeToString(abiturGrade)}
        </p>
        <p className="text-[12px] text-muted-foreground/40 mt-1">
          {totalPoints}/900 Punkte
        </p>
        {/* Confidence bar */}
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="h-1 w-24 rounded-full bg-foreground/[0.05] overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-all"
              style={{ width: `${confidence * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground/30">
            {actualCount}/{totalPossible} Noten
          </span>
        </div>
      </div>

      {/* Block I + Block II cards */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => store.setView('einbringung')}
          className="rounded-xl border border-border/40 p-4 text-left hover:border-violet-500/30 transition-colors"
        >
          <p className="text-[9px] text-muted-foreground/30 uppercase tracking-wider font-medium">
            Block I
          </p>
          <p className="text-2xl font-bold tabular-nums mt-1">
            {blockI.totalPoints}
            <span className="text-[12px] text-muted-foreground/30 font-normal">/600</span>
          </p>
          <p className="text-[10px] text-muted-foreground/40 mt-0.5">
            {blockI.slots.length}/40 Einbringungen
          </p>
          <div className={cn('text-[10px] font-medium mt-1', blockI.isValid ? 'text-emerald-500' : 'text-amber-500')}>
            {blockI.isValid ? '✓ Gültig' : '⚠ Prüfung nötig'}
          </div>
        </button>

        <button
          onClick={() => store.setView('exams')}
          className="rounded-xl border border-border/40 p-4 text-left hover:border-violet-500/30 transition-colors"
        >
          <p className="text-[9px] text-muted-foreground/30 uppercase tracking-wider font-medium">
            Block II
          </p>
          <p className="text-2xl font-bold tabular-nums mt-1">
            {blockII.totalPoints}
            <span className="text-[12px] text-muted-foreground/30 font-normal">/300</span>
          </p>
          <p className="text-[10px] text-muted-foreground/40 mt-0.5">
            {exams.filter((e) => e.actualPoints !== null).length}/5 Prüfungen
          </p>
        </button>
      </div>

      {/* Averages */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/30 p-3">
          <p className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">Ø Alle Noten</p>
          <p className="text-lg font-bold tabular-nums mt-0.5">
            {overallAvg.toFixed(2)} <span className="text-[11px] text-muted-foreground/30">P</span>
          </p>
        </div>
        <div className="rounded-xl border border-border/30 p-3">
          <p className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">Ø Einbringungen</p>
          <p className="text-lg font-bold tabular-nums mt-0.5">
            {einbringungAvg.toFixed(2)} <span className="text-[11px] text-muted-foreground/30">P</span>
          </p>
        </div>
      </div>

      {/* What do I need? */}
      <div className="rounded-xl border border-border/30 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Calculator className="h-3.5 w-3.5 text-violet-500" />
            <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
              Was brauche ich?
            </p>
          </div>
          <div className="flex items-center gap-1">
            {[1.0, 1.5, 2.0, 2.5, 3.0].map((g) => (
              <button
                key={g}
                onClick={() => store.setTargetGrade(g)}
                className={cn(
                  'text-[11px] px-2 py-0.5 rounded-md font-medium transition-all',
                  targetGrade === g
                    ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                    : 'text-muted-foreground/30 hover:text-muted-foreground/50'
                )}
              >
                {gradeToString(g)}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground/60 leading-relaxed">
          {whatINeed.sentence}
        </p>
      </div>

      {/* Qualification checks */}
      <div className="rounded-xl border border-border/30 p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Shield className="h-3.5 w-3.5 text-emerald-500" />
          <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
            Qualifikation ({passedChecks}/{checks.length})
          </p>
        </div>
        <div className="space-y-1">
          {checks.map((check, i) => (
            <div key={i} className="flex items-start gap-2 py-1">
              <div className={cn('mt-0.5 shrink-0', check.passed ? 'text-emerald-500' : 'text-red-400')}>
                {check.passed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              </div>
              <div className="min-w-0">
                <p className={cn('text-[12px] font-medium', check.passed ? 'text-muted-foreground/60' : 'text-red-400')}>
                  {check.label}
                </p>
                <p className="text-[10px] text-muted-foreground/30">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation grid */}
      <div className="grid grid-cols-2 gap-2">
        {HALBJAHRE.map((hj) => (
          <button
            key={hj}
            onClick={() => {
              store.setSelectedHalbjahr(hj);
              store.setView('halbjahr');
            }}
            className="rounded-xl border border-border/30 p-3 text-left hover:border-violet-500/30 hover:bg-violet-500/[0.02] transition-all group"
          >
            <p className="text-[13px] font-semibold group-hover:text-violet-500 transition-colors">
              {hj}
            </p>
            <p className="text-[10px] text-muted-foreground/30 mt-0.5">
              {subjects.filter((s) => {
                const entry = grades[s.id]?.[hj];
                if (!entry) return false;
                const r = computeHalbjahresleistung(entry, hasSchulaufgabe(s, hj));
                return r.source !== 'expected' || r.points > 0;
              }).length}/{subjects.length} Noten
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HALBJAHR VIEW
// ═══════════════════════════════════════════════════════════

function HalbjahrView() {
  const store = useAbiturStore();
  const { subjects, grades, selectedHalbjahr: hj, detailedMode } = store;
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => store.setView('dashboard')}
          className="text-muted-foreground/40 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <BookOpen className="h-4 w-4 text-violet-500" />
        <h1 className="text-lg font-semibold tracking-tight">{hj}</h1>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => store.setDetailedMode(!detailedMode)}
            className={cn(
              'text-[10px] px-2 py-1 rounded-md font-medium transition-colors',
              detailedMode
                ? 'bg-violet-500/10 text-violet-500'
                : 'text-muted-foreground/30 hover:text-muted-foreground/50'
            )}
          >
            {detailedMode ? 'Detailliert' : 'Einfach'}
          </button>
        </div>
      </div>

      {/* Halbjahr tabs */}
      <div className="flex rounded-xl bg-foreground/[0.03] p-0.5">
        {HALBJAHRE.map((h) => (
          <button
            key={h}
            onClick={() => store.setSelectedHalbjahr(h)}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-[12px] font-medium transition-all text-center',
              h === hj
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground/40 hover:text-muted-foreground/60'
            )}
          >
            {h}
          </button>
        ))}
      </div>

      {/* Subject grid */}
      <div className="space-y-1">
        {subjects.map((sub) => {
          const entry = grades[sub.id]?.[hj];
          if (!entry) return null;
          const hasSA = hasSchulaufgabe(sub, hj);
          const result = computeHalbjahresleistung(entry, hasSA);
          const isEditing = editingSubject === sub.id;

          return (
            <div
              key={sub.id}
              className="rounded-xl border border-border/30 overflow-hidden"
            >
              {/* Subject row */}
              <div
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-foreground/[0.02] transition-colors"
                onClick={() => {
                  if (detailedMode) {
                    store.setSelectedSubjectId(sub.id);
                    store.setView('subject');
                  } else {
                    if (isEditing) {
                      setEditingSubject(null);
                    } else {
                      setEditingSubject(sub.id);
                      setEditValue(
                        entry.finalOverride !== null
                          ? String(entry.finalOverride)
                          : result.points > 0
                            ? String(result.points)
                            : ''
                      );
                    }
                  }
                }}
              >
                <div className="w-8 text-center">
                  <span className="text-[11px] font-bold text-muted-foreground/40">{sub.shortName}</span>
                </div>
                <span className="text-[12px] flex-1 truncate text-muted-foreground/60">{sub.name}</span>

                {hasSA && detailedMode && (
                  <span className="text-[9px] text-muted-foreground/25 uppercase">SA</span>
                )}

                <span
                  className={cn(
                    'text-[15px] font-bold tabular-nums w-8 text-right',
                    result.source === 'expected' && result.points === 0
                      ? 'text-muted-foreground/15'
                      : pointsColor(result.points)
                  )}
                >
                  {result.source === 'expected' && result.points === 0 ? '—' : result.points}
                </span>

                <span className="text-[8px] text-muted-foreground/20 w-3 uppercase">
                  {result.source === 'override'
                    ? '✓'
                    : result.source === 'range'
                      ? '~'
                      : result.source === 'expected'
                        ? ''
                        : ''}
                </span>

                {detailedMode && (
                  <ChevronRight className="h-3 w-3 text-muted-foreground/20" />
                )}
              </div>

              {/* Quick-edit inline (Simple Mode) */}
              {!detailedMode && isEditing && (
                <div className="px-3 pb-2.5 flex items-center gap-2">
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="0–15"
                    autoFocus
                    type="number"
                    min={0}
                    max={15}
                    className="w-16 rounded-lg border border-border/40 bg-transparent px-2 py-1 text-[13px] text-center tabular-nums focus:outline-none focus:border-violet-500/40 transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = parseInt(editValue);
                        if (!isNaN(val) && val >= 0 && val <= 15) {
                          store.setFinalOverride(sub.id, hj, val);
                        }
                        setEditingSubject(null);
                      } else if (e.key === 'Escape') {
                        setEditingSubject(null);
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      const val = parseInt(editValue);
                      if (!isNaN(val) && val >= 0 && val <= 15) {
                        store.setFinalOverride(sub.id, hj, val);
                      }
                      setEditingSubject(null);
                    }}
                    className="text-[11px] text-violet-500 font-medium hover:text-violet-400"
                  >
                    Speichern
                  </button>
                  {entry.finalOverride !== null && (
                    <button
                      onClick={() => {
                        store.setFinalOverride(sub.id, hj, null);
                        setEditingSubject(null);
                      }}
                      className="text-[11px] text-muted-foreground/30 hover:text-red-400"
                    >
                      Löschen
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SUBJECT DETAIL VIEW
// ═══════════════════════════════════════════════════════════

function SubjectDetailView() {
  const store = useAbiturStore();
  const { subjects, grades, selectedSubjectId } = store;
  const subject = subjects.find((s) => s.id === selectedSubjectId);
  const [addingKleine, setAddingKleine] = useState<Halbjahr | null>(null);
  const [kleineValue, setKleineValue] = useState('');
  const [saValue, setSaValue] = useState('');
  const [editingSA, setEditingSA] = useState<Halbjahr | null>(null);
  const [targetHJL, setTargetHJL] = useState(10);

  if (!subject) {
    return (
      <div className="p-4 lg:p-8 max-w-2xl mx-auto">
        <button onClick={() => store.setView('dashboard')} className="text-[12px] text-muted-foreground/40">
          ← Zurück
        </button>
        <p className="text-muted-foreground/40 mt-4">Fach nicht gefunden.</p>
      </div>
    );
  }

  const subjectGrades = grades[subject.id];

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => store.setView('halbjahr')}
          className="text-muted-foreground/40 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-lg font-semibold tracking-tight">{subject.name}</h1>
        {subject.isLeistungsfach && (
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-500 border border-violet-500/20">
            Leistungsfach
          </span>
        )}
        {subject.isAbiturFach && !subject.isLeistungsfach && (
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-500 border border-sky-500/20">
            Abiturfach {subject.abiturFachNr}
          </span>
        )}
      </div>

      {/* 4-halves trend */}
      <div className="grid grid-cols-4 gap-2">
        {HALBJAHRE.map((hj) => {
          const entry = subjectGrades?.[hj];
          if (!entry) return null;
          const hasSA = hasSchulaufgabe(subject, hj);
          const result = computeHalbjahresleistung(entry, hasSA);
          return (
            <div key={hj} className="rounded-xl border border-border/30 p-3 text-center">
              <p className="text-[10px] text-muted-foreground/30 font-medium">{hj}</p>
              <p
                className={cn(
                  'text-2xl font-bold tabular-nums mt-1',
                  result.source === 'expected' && result.points === 0
                    ? 'text-muted-foreground/15'
                    : pointsColor(result.points)
                )}
              >
                {result.source === 'expected' && result.points === 0 ? '—' : result.points}
              </p>
              <p className="text-[9px] text-muted-foreground/20 mt-0.5">
                {result.source === 'override' ? 'Endnote' : result.source === 'computed' ? 'Berechnet' : result.source}
              </p>
            </div>
          );
        })}
      </div>

      {/* Detail per halbjahr */}
      {HALBJAHRE.map((hj) => {
        const entry = subjectGrades?.[hj];
        if (!entry) return null;
        const hasSA = hasSchulaufgabe(subject, hj);
        const result = computeHalbjahresleistung(entry, hasSA);
        const smallAvg =
          entry.kleineNachweise.length > 0
            ? entry.kleineNachweise.reduce((a, b) => a + b, 0) / entry.kleineNachweise.length
            : null;

        return (
          <div key={hj} className="rounded-xl border border-border/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold">{hj}</p>
              <p className={cn('text-[15px] font-bold tabular-nums', pointsColor(result.points))}>
                {result.points} P
              </p>
            </div>

            {/* SA */}
            {hasSA && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground/40 w-14">SA:</span>
                {editingSA === hj ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={saValue}
                      onChange={(e) => setSaValue(e.target.value)}
                      type="number" min={0} max={15}
                      autoFocus
                      className="w-14 rounded-lg border border-border/40 bg-transparent px-2 py-1 text-[12px] text-center tabular-nums focus:outline-none focus:border-violet-500/40"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseInt(saValue);
                          if (!isNaN(val) && val >= 0 && val <= 15) {
                            store.setGrade(subject.id, hj, { schulaufgabe: val, status: 'actual' });
                          }
                          setEditingSA(null);
                        } else if (e.key === 'Escape') {
                          setEditingSA(null);
                        }
                      }}
                    />
                    <button onClick={() => setEditingSA(null)} className="text-muted-foreground/20">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setSaValue(entry.schulaufgabe !== null ? String(entry.schulaufgabe) : '');
                      setEditingSA(hj);
                    }}
                    className={cn(
                      'text-[12px] tabular-nums font-medium',
                      entry.schulaufgabe !== null ? pointsColor(entry.schulaufgabe) : 'text-muted-foreground/20'
                    )}
                  >
                    {entry.schulaufgabe !== null ? `${entry.schulaufgabe} P` : '—'}
                  </button>
                )}
              </div>
            )}

            {/* Kleine Nachweise */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-muted-foreground/40 w-14">Mündl.:</span>
                {smallAvg !== null && (
                  <span className="text-[10px] text-muted-foreground/30">
                    Ø {smallAvg.toFixed(1)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {entry.kleineNachweise.map((p, i) => (
                  <span
                    key={i}
                    className={cn(
                      'inline-flex items-center gap-0.5 text-[11px] font-medium px-2 py-0.5 rounded-md bg-foreground/[0.04]',
                      pointsColor(p)
                    )}
                  >
                    {p}
                    <button
                      onClick={() => store.removeKleineNote(subject.id, hj, i)}
                      className="text-muted-foreground/20 hover:text-red-400 ml-0.5"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                {addingKleine === hj ? (
                  <input
                    value={kleineValue}
                    onChange={(e) => setKleineValue(e.target.value)}
                    type="number" min={0} max={15}
                    autoFocus
                    placeholder="0-15"
                    className="w-12 rounded-md border border-border/40 bg-transparent px-1.5 py-0.5 text-[11px] text-center tabular-nums focus:outline-none focus:border-violet-500/40"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = parseInt(kleineValue);
                        if (!isNaN(val) && val >= 0 && val <= 15) {
                          store.addKleineNote(subject.id, hj, val);
                          setKleineValue('');
                        }
                      } else if (e.key === 'Escape') {
                        setAddingKleine(null);
                        setKleineValue('');
                      }
                    }}
                    onBlur={() => {
                      setAddingKleine(null);
                      setKleineValue('');
                    }}
                  />
                ) : (
                  <button
                    onClick={() => {
                      setAddingKleine(hj);
                      setKleineValue('');
                    }}
                    className="text-[11px] px-2 py-0.5 rounded-md border border-dashed border-border/40 text-muted-foreground/30 hover:border-violet-500/30 hover:text-violet-500 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Final override */}
            <div className="flex items-center gap-2 pt-1 border-t border-border/20">
              <span className="text-[10px] text-muted-foreground/40 w-14">Endnote:</span>
              <input
                type="number" min={0} max={15}
                value={entry.finalOverride ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : parseInt(e.target.value);
                  if (val === null || (!isNaN(val) && val >= 0 && val <= 15)) {
                    store.setFinalOverride(subject.id, hj, val);
                  }
                }}
                placeholder="—"
                className="w-14 rounded-lg border border-border/40 bg-transparent px-2 py-1 text-[12px] text-center tabular-nums focus:outline-none focus:border-violet-500/40"
              />
              <span className="text-[10px] text-muted-foreground/20">
                (überschreibt Berechnung)
              </span>
            </div>
          </div>
        );
      })}

      {/* "What SA do I need?" Cherry */}
      <div className="rounded-xl border border-border/30 p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Target className="h-3.5 w-3.5 text-violet-500" />
          <p className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">
            Was brauche ich?
          </p>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[12px] text-muted-foreground/40">Ziel-HJL:</span>
          <div className="flex items-center gap-1">
            {[7, 8, 9, 10, 11, 12, 13, 14, 15].map((p) => (
              <button
                key={p}
                onClick={() => setTargetHJL(p)}
                className={cn(
                  'text-[11px] px-1.5 py-0.5 rounded font-medium transition-all tabular-nums',
                  targetHJL === p
                    ? 'bg-violet-500/10 text-violet-500'
                    : 'text-muted-foreground/25 hover:text-muted-foreground/40'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        {HALBJAHRE.map((hj) => {
          const entry = subjectGrades?.[hj];
          if (!entry) return null;
          const hasSA = hasSchulaufgabe(subject, hj);
          const smallAvg =
            entry.kleineNachweise.length > 0
              ? entry.kleineNachweise.reduce((a, b) => a + b, 0) / entry.kleineNachweise.length
              : null;
          const needed = whatSADoINeed(targetHJL, smallAvg, hasSA);
          if (entry.finalOverride !== null) return null;
          return (
            <p key={hj} className="text-[12px] text-muted-foreground/50 py-0.5">
              <span className="font-medium">{hj}:</span> {needed.sentence}
            </p>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EINBRINGUNG VIEW
// ═══════════════════════════════════════════════════════════

function EinbringungView() {
  const store = useAbiturStore();
  const {
    subjects,
    grades,
    einbringungStrategy,
    lockedSlots,
  } = store;

  const blockI = useMemo(
    () =>
      computeEinbringung({
        subjects,
        grades,
        lockedSlots: new Set(lockedSlots),
        strategy: einbringungStrategy,
        onlyFortgefuehrteFremdsprache: store.onlyFortgefuehrteFremdsprache,
        onlyFortgefuehrteNaturwissenschaft: store.onlyFortgefuehrteNaturwissenschaft,
        pugSubjectId: store.pugSubjectId,
        wrGeoSubjectId: store.wrGeoSubjectId,
      }),
    [subjects, grades, lockedSlots, einbringungStrategy, store.onlyFortgefuehrteFremdsprache, store.onlyFortgefuehrteNaturwissenschaft, store.pugSubjectId, store.wrGeoSubjectId]
  );

  // Build lookup for quick checks
  const includedSet = new Set(
    blockI.slots.map((s) => `${s.subjectId}:${s.halbjahr}`)
  );

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => store.setView('dashboard')}
          className="text-muted-foreground/40 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <BarChart3 className="h-4 w-4 text-violet-500" />
        <h1 className="text-lg font-semibold tracking-tight">Einbringung</h1>
        <span className="ml-auto text-[12px] font-medium tabular-nums text-muted-foreground/50">
          {blockI.slots.length}/40
        </span>
      </div>

      {/* Strategy toggle */}
      <div className="flex rounded-xl bg-foreground/[0.03] p-0.5">
        {(['maximize', 'stable'] as const).map((s) => (
          <button
            key={s}
            onClick={() => store.setStrategy(s)}
            className={cn(
              'flex-1 rounded-lg py-2 text-[12px] font-medium transition-all text-center',
              einbringungStrategy === s
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground/40 hover:text-muted-foreground/60'
            )}
          >
            {s === 'maximize' ? '🔼 Maximieren' : '🔒 Stabil'}
          </button>
        ))}
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-4 text-[12px]">
        <span className="text-muted-foreground/40">
          Pflicht: <span className="font-semibold text-foreground">{blockI.mandatoryCount}</span>
        </span>
        <span className="text-muted-foreground/20">·</span>
        <span className="text-muted-foreground/40">
          Frei wählbar: <span className="font-semibold text-foreground">{blockI.freeCount}</span>
        </span>
        <span className="text-muted-foreground/20">·</span>
        <span className={cn('font-semibold', blockI.isValid ? 'text-emerald-500' : 'text-amber-500')}>
          {blockI.totalPoints} Punkte
        </span>
      </div>

      {/* Issues */}
      {blockI.issues.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3 space-y-1">
          {blockI.issues.map((issue, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[12px] text-amber-600 dark:text-amber-400">{issue}</p>
            </div>
          ))}
        </div>
      )}

      {/* Matrix: subjects × halbjahre */}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-muted-foreground/30">
              <th className="text-left font-medium py-1.5 pr-3 w-16">Fach</th>
              {HALBJAHRE.map((hj) => (
                <th key={hj} className="text-center font-medium py-1.5 px-1 w-16">{hj}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subjects.map((sub) => (
              <tr key={sub.id} className="border-t border-border/10">
                <td className="py-1.5 pr-3">
                  <span className="font-semibold text-muted-foreground/50">{sub.shortName}</span>
                </td>
                {HALBJAHRE.map((hj) => {
                  const entry = grades[sub.id]?.[hj];
                  if (!entry) return <td key={hj} />;

                  const hasSA = hasSchulaufgabe(sub, hj);
                  const result = computeHalbjahresleistung(entry, hasSA);
                  const key = `${sub.id}:${hj}`;
                  const isIncluded = includedSet.has(key);
                  const slot = blockI.slots.find(
                    (s) => s.subjectId === sub.id && s.halbjahr === hj
                  );
                  const isMandatory = slot?.isMandatory ?? false;
                  const isLocked = lockedSlots.includes(key);

                  return (
                    <td key={hj} className="text-center py-1.5 px-1">
                      <button
                        onClick={() => {
                          if (!isMandatory) {
                            store.toggleLockSlot(sub.id, hj);
                          }
                        }}
                        disabled={isMandatory}
                        className={cn(
                          'inline-flex items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-[12px] font-bold tabular-nums transition-all w-full',
                          isIncluded
                            ? isMandatory
                              ? 'bg-violet-500/10 text-violet-500 cursor-default'
                              : isLocked
                                ? 'bg-sky-500/10 text-sky-500 ring-1 ring-sky-500/20'
                                : 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-foreground/[0.02] text-muted-foreground/25',
                          !isMandatory && 'hover:opacity-80 cursor-pointer'
                        )}
                        title={
                          isMandatory
                            ? slot?.reason
                            : isLocked
                              ? 'Gesperrt (klicken zum Entsperren)'
                              : 'Klicken zum Sperren'
                        }
                      >
                        {result.points > 0 || result.source !== 'expected' ? result.points : '—'}
                        {isMandatory && <Lock className="h-2.5 w-2.5 ml-0.5" />}
                        {isLocked && !isMandatory && <Lock className="h-2.5 w-2.5 ml-0.5" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground/30 pt-2">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-violet-500/20" /> Pflicht
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-sky-500/20" /> Gesperrt
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-emerald-500/20" /> Auto-gewählt
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-foreground/[0.04]" /> Nicht eingebracht
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EXAMS VIEW (Block II)
// ═══════════════════════════════════════════════════════════

function ExamsView() {
  const store = useAbiturStore();
  const { subjects, exams } = store;

  const blockII = useMemo(() => computeBlockII(exams), [exams]);

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => store.setView('dashboard')}
          className="text-muted-foreground/40 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <TrendingUp className="h-4 w-4 text-violet-500" />
        <h1 className="text-lg font-semibold tracking-tight">Abiturprüfungen</h1>
        <span className="ml-auto text-[14px] font-bold tabular-nums">
          {blockII.totalPoints}<span className="text-muted-foreground/30 text-[12px]">/300</span>
        </span>
      </div>

      <p className="text-[12px] text-muted-foreground/40">
        5 Prüfungen × 4 = max. 300 Punkte (Block II). Trage erwartete oder tatsächliche Punkte ein.
      </p>

      <div className="space-y-3">
        {exams.map((exam, i) => {
          const sub = subjects.find((s) => s.id === exam.subjectId);
          const pts = exam.actualPoints ?? exam.expectedPoints ?? 0;
          const weighted = pts * 4;

          return (
            <div
              key={exam.subjectId}
              className="rounded-xl border border-border/40 p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold text-violet-500 bg-violet-500/10 px-1.5 py-0.5 rounded">
                  {i + 1}
                </span>
                <p className="text-[13px] font-semibold">{sub?.name ?? 'Unbekannt'}</p>
                <span className="ml-auto text-[12px] font-bold tabular-nums text-muted-foreground/40">
                  {weighted} P
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">
                    Erwartet
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={exam.expectedPoints ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : parseInt(e.target.value);
                      if (val === null || (!isNaN(val) && val >= 0 && val <= 15)) {
                        store.setExam(i, { expectedPoints: val });
                      }
                    }}
                    placeholder="—"
                    className="mt-1 w-full rounded-lg border border-border/40 bg-transparent px-3 py-2 text-[14px] text-center tabular-nums font-semibold focus:outline-none focus:border-violet-500/40 transition-colors"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">
                    Tatsächlich
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={exam.actualPoints ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : parseInt(e.target.value);
                      if (val === null || (!isNaN(val) && val >= 0 && val <= 15)) {
                        store.setExam(i, { actualPoints: val });
                      }
                    }}
                    placeholder="—"
                    className="mt-1 w-full rounded-lg border border-border/40 bg-transparent px-3 py-2 text-[14px] text-center tabular-nums font-semibold focus:outline-none focus:border-emerald-500/40 transition-colors"
                  />
                </div>
                <div className="w-14 text-center">
                  <label className="text-[9px] text-muted-foreground/30 uppercase tracking-wider">
                    ×4
                  </label>
                  <p className={cn('text-[16px] font-bold tabular-nums mt-1', pointsColor(pts))}>
                    {weighted}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-border/40 p-4 text-center">
        <p className="text-[10px] text-muted-foreground/30 uppercase tracking-wider">Block II Gesamt</p>
        <p className="text-3xl font-black tabular-nums mt-1">
          {blockII.totalPoints}
          <span className="text-[14px] text-muted-foreground/30 font-normal">/300</span>
        </p>
      </div>
    </div>
  );
}
