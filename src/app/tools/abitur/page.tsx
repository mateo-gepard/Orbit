'use client';

import React, { useState, useMemo } from 'react';
import { useAbiturStore } from '@/lib/abitur-store';
import {
  ALL_SUBJECTS,
  SEMESTERS,
  SEMESTER_LABELS,
  type Semester,
  type SubjectDefinition,
  type IndividualGrade,
  getSubject,
  isEingebracht,
  canToggleSemester,
  isMandatory,
  countAllEinbringungen,
  calculateAbitur,
  calculateNeededAverage,
  getPointsColor,
  getPointsBg,
  selectSubjectWithExclusivity,
  subjectsConflict,
  EXCLUSIVE_GROUPS,
  canSubjectBeLF,
  canSubjectBeOralExam,
  validateExamCombination,
  checkFieldCoverage,
  pointsToDecimalGrade,
  type AbiturProfile,
  type AbiturResult,
} from '@/lib/abitur';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import {
  GraduationCap,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
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
  Trash2,
  FileText,
  FileCheck,
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

const MANDATORY_IDS = ['deu', 'mat', 'wsem', 'psem'];

type AbiturLanguage = 'en' | 'de';

const AbiturLanguageContext = React.createContext<AbiturLanguage>('en');

const CATEGORY_LABELS: Record<AbiturLanguage, Record<string, string>> = {
  en: {
    language: 'Languages',
    art: 'Arts',
    social: 'Social sciences',
    stem: 'STEM',
    sport: 'Physical education',
    seminar: 'Seminars',
    other: 'Other',
  },
  de: {
    language: 'Sprachen',
    art: 'Musische Fächer',
    social: 'Gesellschaftswiss.',
    stem: 'MINT',
    sport: 'Sport',
    seminar: 'Seminare',
    other: 'Sonstige',
  },
};

const ENGLISH_SUBJECT_NAMES: Record<string, string> = {
  deu: 'German',
  eng: 'English',
  fra: 'French',
  lat: 'Latin',
  spa: 'Spanish (late-starting)',
  ita: 'Italian',
  rus: 'Russian',
  gri: 'Greek',
  kun: 'Art',
  mus: 'Music',
  ges: 'History',
  geo: 'Geography',
  pug: 'Politics & Society',
  wir: 'Economics & Law',
  rev: 'Protestant Religious Education',
  rka: 'Catholic Religious Education',
  eth: 'Ethics',
  mat: 'Mathematics',
  phy: 'Physics',
  che: 'Chemistry',
  bio: 'Biology',
  inf: 'Computer Science',
  spo: 'Physical Education',
  wsem: 'W-Seminar',
  psem: 'P-Seminar',
};

const ENGLISH_SUBJECT_SHORT_NAMES: Record<string, string> = {
  deu: 'Ger',
  eng: 'Eng',
  fra: 'Fre',
  lat: 'Lat',
  spa: 'Spa',
  ita: 'Ita',
  rus: 'Rus',
  gri: 'Gre',
  kun: 'Art',
  mus: 'Mus',
  ges: 'His',
  geo: 'Geo',
  pug: 'Pol',
  wir: 'Eco',
  rev: 'PRE',
  rka: 'CRE',
  eth: 'Eth',
  mat: 'Mat',
  phy: 'Phy',
  che: 'Che',
  bio: 'Bio',
  inf: 'CS',
  spo: 'PE',
  wsem: 'W',
  psem: 'P',
};

function useAbiturLocale() {
  const lang = React.useContext(AbiturLanguageContext);
  return {
    lang,
    text: (english: string, german: string) => lang === 'de' ? german : english,
  };
}

function subjectName(subject: SubjectDefinition | undefined, lang: AbiturLanguage): string {
  if (!subject) return '';
  return lang === 'de' ? subject.name : (ENGLISH_SUBJECT_NAMES[subject.id] ?? subject.name);
}

function subjectShortName(subject: SubjectDefinition, lang: AbiturLanguage): string {
  return lang === 'de' ? subject.shortName : (ENGLISH_SUBJECT_SHORT_NAMES[subject.id] ?? subject.shortName);
}

function formatAbiturNumber(value: number, lang: AbiturLanguage, fractionDigits: number): string {
  return new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: false,
  }).format(value);
}

function localizeAbiturMessage(message: string | undefined, lang: AbiturLanguage): string {
  if (!message) return '';
  if (lang === 'de') return message;

  const prefixedMessage = message.match(/^(4\. Prüfung|5\. Prüfung|Leistungsfach): (.+)$/);
  if (prefixedMessage) {
    const prefix = prefixedMessage[1] === '4. Prüfung'
      ? 'Fourth exam'
      : prefixedMessage[1] === '5. Prüfung'
        ? 'Fifth exam'
        : 'Advanced subject';
    return `${prefix}: ${localizeAbiturMessage(prefixedMessage[2], lang)}`;
  }

  const exact: Record<string, string> = {
    'Fach nicht gefunden': 'Subject not found',
    'Spätbeginnende Fremdsprachen können nicht LF sein': 'Late-starting foreign languages cannot be the advanced subject',
    'Spätbeginnende Sprache — nur mündlich (Kolloquium) möglich': 'Late-starting languages can only be taken as an oral exam',
    'Sport nur als schriftl. Prüfung mit Additum': 'Physical Education is only available as a written exam with an Additum',
    'Leistungsfach fehlt': 'Advanced subject is missing',
    '4. Prüfungsfach fehlt': 'Fourth exam subject is missing',
    '5. Prüfungsfach fehlt': 'Fifth exam subject is missing',
    'Jedes Prüfungsfach darf nur einmal vorkommen': 'Each exam subject can only be selected once',
    'Joker-Regel wird nicht verbindlich berechnet — bitte Oberstufenkoordination einbeziehen': 'The substitution rule is not calculated authoritatively; confirm it with your school coordinator',
    '4. und 5. Prüfung dürfen nicht dasselbe Fach sein': 'The fourth and fifth exams must be different subjects',
    'Kein Prüfungsfach aus Aufgabenfeld I (sprachl.-lit.-künstlerisch)': 'No exam subject covers subject area I (languages, literature and arts)',
    'Kein Prüfungsfach aus Aufgabenfeld II (gesellschaftswiss.)': 'No exam subject covers subject area II (social sciences)',
    'Kein Prüfungsfach aus Aufgabenfeld III (math.-naturwiss.)': 'No exam subject covers subject area III (mathematics and sciences)',
    'Eine fortgeführte Fremdsprache oder Naturwissenschaft muss Prüfungsfach sein': 'A continued foreign language or natural science must be an exam subject',
    'Mindestens ein GPR-Fach muss Prüfungsfach sein': 'At least one social-science subject must be an exam subject',
    'Seminare können nicht als Prüfungsfach gewählt werden': 'Seminars cannot be selected as exam subjects',
    'Abiturfach — alle 4 HJ Pflicht': 'Abitur subject — all four semesters are required',
    'P-Seminar — nicht in Block I': 'P-Seminar — not included in Block I',
    'W-Seminar — 12/1 und 12/2 sind Pflicht': 'W-Seminar — Q12/1 and Q12/2 are required',
    'W-Seminar — 13/1 und 13/2 zählen nicht': 'W-Seminar — Q13/1 and Q13/2 are not included',
    'Klicken zum Streichen': 'Select to exclude',
    'Klicken zum Einbringen': 'Select to include',
    'Benötigt Additum': 'Requires an Additum',
    'Benötigt Additum (Theorie + Praxis)': 'Requires an Additum (theory and practice)',
    'Benötigt Sport-Additum (Theorie + Praxis)': 'Requires a Physical Education Additum (theory and practice)',
    'Konflikt': 'Conflict',
    'Religionslehre bzw. Ethik fehlt': 'Religious Education or Ethics is missing',
    'Geschichte fehlt': 'History is missing',
    'Politik und Gesellschaft fehlt': 'Politics & Society is missing',
    'Geographie oder Wirtschaft und Recht fehlt': 'Geography or Economics & Law is missing',
    'GPR-Bereich: im fortgeführten Fach 3, im anderen Fach 1 Halbjahr erforderlich': 'Social sciences: three semesters in the continued subject and one in the other subject are required',
    'Kunst oder Musik fehlt': 'Art or Music is missing',
    'Kunst/Musik: 3 Halbjahre erforderlich': 'Art/Music: three semesters are required',
    'W-Seminar: nur 12/1 und 12/2 dürfen eingebracht werden': 'W-Seminar: only Q12/1 and Q12/2 may be included',
    'W-Seminar und Seminararbeit fehlen': 'W-Seminar and seminar paper are missing',
    'Joker-Regel ist in diesem Rechner nicht vollständig abbildbar; schulisch prüfen lassen': 'The substitution rule cannot be fully represented here; confirm it with your school',
    'Unbekannt': 'Unknown',
    'Pflichtfach — alle 4 HJ': 'Required subject — all four semesters',
    'Leistungsfach — alle 4 HJ': 'Advanced subject — all four semesters',
    'Prüfungsfach — alle 4 HJ': 'Exam subject — all four semesters',
    'Einzige Fremdsprache — alle 4 HJ Pflicht': 'Only foreign language — all four semesters are required',
    'Fremdsprache — mind. 4 HJ gesamt über alle FS': 'Foreign language — at least four semesters across all foreign languages',
    'Einzige Naturwissenschaft — alle 4 HJ Pflicht': 'Only natural science — all four semesters are required',
    'Naturwissenschaft — mind. 4 HJ gesamt über alle NW': 'Natural science — at least four semesters across all natural sciences',
    'Rel./Ethik — 3 von 4 HJ Pflicht': 'Religious Education/Ethics — three of four semesters are required',
    'Geschichte — 3 von 4 HJ Pflicht': 'History — three of four semesters are required',
    'GPR-Verbund — 3 HJ fortgeführt + 1 HJ Gegenfach': 'Social sciences group — three semesters in the continued subject plus one in the paired subject',
    'Musisches Pflichtfach — 3 von 4 HJ': 'Required arts subject — three of four semesters',
    'Sport — optional, max. 3 HJ zählbar': 'Physical Education — optional, at most three semesters may count',
    'W-Seminar — 12/1 + 12/2 + Seminararbeit': 'W-Seminar — Q12/1 + Q12/2 + seminar paper',
    'Informatik — Kursplan individuell prüfen': 'Computer Science — check the individual course plan',
    'Weitere Einbringung — Kursplan individuell prüfen': 'Additional inclusion — check the individual course plan',
    'prüfen': 'check',
  };
  if (exact[message]) return exact[message];

  let translated = message;
  const subjectEntries = ALL_SUBJECTS
    .map((subject) => [subject.name, subjectName(subject, 'en')] as const)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [german, english] of subjectEntries) {
    translated = translated.replaceAll(german, english);
  }

  return translated
    .replace(' kann nicht Leistungsfach sein', ' cannot be the advanced subject')
    .replace(' ist nicht als schriftliche Prüfung zugelassen', ' is not permitted as a written exam')
    .replace(' ist nicht als Kolloquium zugelassen', ' is not permitted as an oral exam')
    .replace(' ist bereits als schriftliche Prüfung belegt', ' is already assigned as a written exam')
    .replace(' schließen sich gegenseitig aus', ' are mutually exclusive')
    .replace(' benötigt Additum (2 Jahre Theorie + Praxis)', ' requires an Additum (two years of theory and practice)')
    .replace(/^Genau 40 Einbringungen erforderlich/, 'Exactly 40 included results are required')
    .replace(' fehlt in der Fächerwahl', ' is missing from the subject selection')
    .replace(': alle 4 Halbjahre sind Pflicht', ': all four semesters are required')
    .replace(/^Fremdsprachen: mindestens 4 Halbjahre gesamt/, 'Foreign languages: at least four semesters in total')
    .replace(/^Naturwissenschaften: mindestens 4 Halbjahre gesamt/, 'Natural sciences: at least four semesters in total')
    .replace(': 3 Halbjahre erforderlich', ': three semesters are required')
    .replace(/^Physical Education: höchstens 3 Halbjahre/, 'Physical Education: at most three semesters')
    .replace('offen/0P', 'missing/0 pts')
    .replace(/(\d+)× 0P/g, '$1× 0 pts')
    .replace(/(\d+) offen/g, '$1 missing')
    .replace(/^offen$/, 'missing')
    .replace(/^unvollständig$/, 'incomplete')
    .replace(/^nicht erfüllt$/, 'not met')
    .replace(' gesamt', ' total')
    .replace(/(\d+)P total/g, '$1 pts total');
}

const ENGLISH_HURDLE_LABELS: Record<string, string> = {
  selection: 'Inclusion rules met',
  'b1-complete': 'All 40 results entered',
  'b1-min': 'Block I ≥ 200 points',
  'b1-40': 'Exactly 40 included results',
  'b1-def': 'At least 32 results ≥ 5 pts',
  'b1-zero': 'No required result has 0 points',
  'q-core': 'German + Mathematics + advanced subject ≥ 48 points',
  'q-exams': 'Five exam subjects ≥ 100 points',
  'exam-fields': 'All three subject areas',
  'b2-complete': 'All five exams entered',
  'b2-min': 'Block II ≥ 100 points',
  'b2-3': 'At least three exams ≥ 5 pts',
  'b2-core': 'Core subject passed',
  'b2-zero': 'No exam has 0 points',
  'b2-trio': 'Exam-subject trio ≥ 40 points',
  'b2-fields': 'At most one result < 4 pts per subject area',
  sem: 'Seminar paper and presentation > 0 pts',
};

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════

export default function AbiturPage() {
  const profile = useAbiturStore((s) => s.profile);
  const { lang } = useTranslation();
  const abiturLanguage: AbiturLanguage = lang === 'de' ? 'de' : 'en';
  return (
    <AbiturLanguageContext.Provider value={abiturLanguage}>
      {!profile.onboardingComplete ? <OnboardingWizard /> : <AbiturDashboard />}
    </AbiturLanguageContext.Provider>
  );
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
  const { lang, text } = useAbiturLocale();

  const [step, setStep] = useState(0);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(profile.subjects);
  const [lf, setLf] = useState(profile.leistungsfach);
  const [exam4, setExam4] = useState(profile.examSubjects[3] || '');
  const [exam5, setExam5] = useState(profile.examSubjects[4] || '');
  const [selectionError, setSelectionError] = useState('');

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
    const protectedSubjects = [lf, exam4, exam5].filter(Boolean);
    if (selectedSubjects.includes(id)) {
      if (protectedSubjects.includes(id)) {
        setSelectionError(text(
          `${subjectName(getSubject(id), lang)} is currently selected as an exam subject. Choose another exam subject first.`,
          `${subjectName(getSubject(id), lang)} ist aktuell als Prüfungsfach gewählt. Wähle zuerst ein anderes Prüfungsfach.`,
        ));
        return;
      }
      setSelectionError('');
      setSelectedSubjects(selectedSubjects.filter((subjectId) => subjectId !== id));
      return;
    }
    const result = selectSubjectWithExclusivity([...selectedSubjects, id], id, protectedSubjects);
    if (result.blockedBy) {
      setSelectionError(text(
        `${subjectName(getSubject(id), lang)} cannot replace protected exam subject ${subjectName(getSubject(result.blockedBy), lang)}.`,
        `${subjectName(getSubject(id), lang)} kann das geschützte Prüfungsfach ${subjectName(getSubject(result.blockedBy), lang)} nicht ersetzen.`,
      ));
      return;
    }
    setSelectionError('');
    setSelectedSubjects(result.subjects);
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

  const stepTitles = [
    '',
    text('Subject selection', 'Fächerwahl'),
    text('Advanced subject', 'Leistungsfach'),
    text('Oral exams', 'Kolloquien'),
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Top strip */}
      <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-3.5 w-3.5 text-emerald-500" strokeWidth={1.5} />
          <span className="text-[11px] font-mono text-muted-foreground/50">{text('ABITUR SETUP', 'ABITUR-EINRICHTUNG')}</span>
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
              <h1 className="text-2xl font-bold tracking-tight">{text('Qualification phase', 'Qualifikationsphase')}</h1>
              <p className="text-[13px] text-muted-foreground/50 mt-2 leading-relaxed">
                {text(
                  'Your personal Abitur calculator. Enter grades, manage included results and track each semester.',
                  'Dein persönlicher Abiturrechner. Noten eintragen, Einbringungen verwalten, Schnitte pro Halbjahr tracken.',
                )}
              </p>
            </div>
            <div className="flex items-center justify-center gap-6 pt-2">
              {[
                { icon: Layers, label: text('Semesters', 'Halbjahre') },
                { icon: CircleDot, label: text('Included results', 'Einbringungen') },
                { icon: Shield, label: text('Requirements', 'Hürden') },
              ].map((f) => (
                <div key={f.label} className="flex flex-col items-center gap-1.5">
                  <div className="h-9 w-9 rounded-xl bg-foreground/[0.04] flex items-center justify-center">
                    <f.icon className="h-4 w-4 text-muted-foreground/40" strokeWidth={1.5} />
                  </div>
                  <span className="text-[11px] text-muted-foreground/30 uppercase tracking-widest">{f.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="w-full max-w-lg space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-semibold tracking-tight">{text('Your subjects', 'Deine Fächer')}</h2>
              <p className="text-[11px] text-muted-foreground/40 mt-1">
                {text('Required subjects preselected', 'Pflichtfächer vorausgewählt')} · {selectedSubjects.length} {text('selected', 'gewählt')}
              </p>
            </div>
            <div className="space-y-5 max-h-[55vh] overflow-y-auto pr-1">
              {selectionError && (
                <p role="alert" className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-600 dark:text-amber-300">
                  {selectionError}
                </p>
              )}
              {Object.entries(groupedOptional).map(([cat, subs]) => (
                <div key={cat}>
                  <p className="text-[11px] text-muted-foreground/30 uppercase tracking-widest mb-2">
                    {CATEGORY_LABELS[lang][cat] || cat}
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
                          type="button"
                          key={s.id}
                          onClick={() => toggleSubject(s.id)}
                          disabled={mandatory}
                          aria-pressed={selected}
                          className={cn(
                            'flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12px] text-left transition-all',
                            selected
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'hover:bg-foreground/[0.03] text-muted-foreground/60',
                            mandatory && 'opacity-40 cursor-not-allowed'
                          )}
                          title={blockedSubject && !selected
                            ? text(
                                `Automatically deselects ${subjectName(blockedSubject, lang)}`,
                                `Wählt automatisch ${subjectName(blockedSubject, lang)} ab`,
                              )
                            : undefined}
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
                          <span className="truncate">{subjectName(s, lang)}</span>
                          <div className="ml-auto flex items-center gap-1">
                            {s.lateStart && (
                              <span className="text-[10px] text-amber-500 bg-amber-500/10 px-1 py-0.5 rounded font-medium">{text('late', 'spät')}</span>
                            )}
                            {s.requiresAdditum && (
                              <span className="text-[10px] text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded font-medium">Add.</span>
                            )}
                            <span className={cn('text-[11px] font-mono', FIELD_COLOR[s.field])}>
                              {subjectShortName(s, lang)}
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
              <h2 className="text-lg font-semibold tracking-tight">{text('Advanced subject', 'Leistungsfach')}</h2>
              <p className="text-[11px] text-muted-foreground/40 mt-1">
                {text(
                  'Your third written Abitur subject (advanced level)',
                  'Dein 3. schriftliches Abiturfach (erhöhtes Anforderungsniveau)',
                )}
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
                      type="button"
                      key={s.id}
                      onClick={() => !isDisabled && setLf(s.id)}
                      disabled={isDisabled}
                      aria-pressed={lf === s.id}
                      className={cn(
                        'w-full min-h-11 flex items-center gap-3 rounded-xl px-4 py-3 text-[13px] text-left transition-all',
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
                        {subjectShortName(s, lang)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p>{subjectName(s, lang)}</p>
                          {s.requiresAdditum && (
                            <span className="text-[10px] text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded font-medium">Additum</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground/30">
                          {text('Subject area', 'Aufgabenfeld')} {s.field || '—'} · {s.hoursPerWeek} {text('hrs/week', 'h/Woche')}
                          {validation.reason ? ` · ${localizeAbiturMessage(validation.reason, lang)}` : ''}
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
              <h2 className="text-lg font-semibold tracking-tight">{text('Oral exam subjects', 'Kolloquiumsfächer')}</h2>
              <p className="text-[11px] text-muted-foreground/40 mt-1">
                {text(
                  'Fourth and fifth exam subjects (oral) · All three subject areas must be covered',
                  '4. und 5. Prüfungsfach (mündlich) · Alle 3 Aufgabenfelder müssen abgedeckt sein',
                )}
              </p>
            </div>

            {/* Field coverage indicator */}
            {(() => {
              const validation = validateExamCombination(lf, exam4, exam5);
              const coverage = checkFieldCoverage(['deu', 'mat', lf, exam4, exam5].filter(Boolean));
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
                          <span>{text('Area', 'AF')} {f}</span>
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
                          <p className="text-[11px] text-red-400">{localizeAbiturMessage(err, lang)}</p>
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
                          <p className="text-[11px] text-amber-500">{localizeAbiturMessage(warn, lang)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {[
              { label: text('Fourth exam (oral)', '4. Prüfung (Kolloquium)'), val: exam4, setVal: setExam4, other: exam5 },
              { label: text('Fifth exam (oral)', '5. Prüfung (Kolloquium)'), val: exam5, setVal: setExam5, other: exam4 },
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
                      const exclusiveConflict = subjectsConflict(id, row.other) || subjectsConflict(id, lf);

                      // Show field coverage hint
                      const hypothetical = ['deu', 'mat', lf, row.other, id].filter(Boolean);
                      const coverage = checkFieldCoverage(hypothetical);

                      return (
                        <button
                          type="button"
                          key={id}
                          onClick={() => !isDisabled && !exclusiveConflict && row.setVal(id)}
                          disabled={isDisabled || exclusiveConflict}
                          aria-pressed={row.val === id}
                          className={cn(
                            'min-h-11 rounded-xl px-3 py-2.5 text-[12px] text-left transition-all relative',
                            isDisabled || exclusiveConflict
                              ? 'opacity-30 cursor-not-allowed'
                              : row.val === id
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium'
                                : 'hover:bg-foreground/[0.03] text-muted-foreground/60'
                          )}
                          title={
                            isDisabled ? localizeAbiturMessage(oralCheck.reason, lang)
                            : exclusiveConflict ? text('Mutually exclusive with another protected exam subject', 'Schließt sich mit einem anderen geschützten Prüfungsfach aus')
                            : undefined
                          }
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{subjectName(s, lang)}</span>
                            {s.requiresAdditum && (
                              <span className="text-[10px] text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded font-medium shrink-0">Add.</span>
                            )}
                          </div>
                          {isDisabled && (
                            <p className="text-[11px] text-red-400/70 mt-0.5 truncate">{localizeAbiturMessage(oralCheck.reason, lang)}</p>
                          )}
                          {exclusiveConflict && (
                            <p className="text-[11px] text-red-400/70 mt-0.5">{text('Mutually exclusive', 'Exklusiv-Konflikt')}</p>
                          )}
                          {!isDisabled && !exclusiveConflict && row.val !== id && !coverage.allCovered && (
                            <p className="text-[11px] text-amber-500/50 mt-0.5">
                              {!coverage.field1 && text('Area I missing', 'AF I fehlt')}
                              {!coverage.field2 && text('Area II missing', 'AF II fehlt')}
                              {!coverage.field3 && text('Area III missing', 'AF III fehlt')}
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
          type="button"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className={cn(
            'flex min-h-11 items-center gap-1 px-2 text-[12px] transition-colors',
            step === 0
              ? 'text-muted-foreground/45 cursor-not-allowed'
              : 'text-muted-foreground/50 hover:text-foreground'
          )}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {text('Back', 'Zurück')}
        </button>
        {step < 3 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
            className={cn(
              'flex min-h-11 items-center gap-1.5 rounded-xl px-5 py-2.5 text-[13px] font-medium transition-all active:scale-95',
              canNext
                ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/20'
                : 'bg-foreground/[0.05] text-muted-foreground/30 cursor-not-allowed'
            )}
          >
            {text('Next', 'Weiter')}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={!canNext}
            className={cn(
              'flex min-h-11 items-center gap-1.5 rounded-xl px-5 py-2.5 text-[13px] font-medium transition-all active:scale-95',
              canNext
                ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/20'
                : 'bg-foreground/[0.05] text-muted-foreground/30 cursor-not-allowed'
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {text('Start', 'Starten')}
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
  const { text } = useAbiturLocale();
  const [view, setView] = useState<View>('overview');

  const result = useMemo(() => calculateAbitur(profile), [profile]);

  // Full-page sub-views with back navigation
  if (view === 'settings' || view === 'subjects' || view === 'einbringungen') {
    const titles: Record<string, string> = {
      settings: text('SETTINGS', 'EINSTELLUNGEN'),
      subjects: text('SUBJECTS', 'FÄCHER'),
      einbringungen: text('INCLUDED RESULTS', 'EINBRINGUNGEN'),
    };
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <div className="px-4 lg:px-8 py-3 border-b border-border/30 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView('overview')}
            aria-label={text('Back to Abitur overview', 'Zurück zur Abitur-Übersicht')}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-foreground/[0.03] hover:text-foreground"
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
            type="button"
            onClick={() => setView('subjects')}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground/30 transition-colors hover:bg-foreground/[0.03] hover:text-foreground"
            title={text('Manage subjects', 'Fächer verwalten')}
            aria-label={text('Manage subjects', 'Fächer verwalten')}
          >
            <BookOpen className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView('einbringungen')}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground/30 transition-colors hover:bg-foreground/[0.03] hover:text-foreground"
            title={text('Included results', 'Einbringungen')}
            aria-label={text('Manage included results', 'Einbringungen verwalten')}
          >
            <CircleDot className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView('settings')}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground/30 transition-colors hover:bg-foreground/[0.03] hover:text-foreground"
            title={text('Settings', 'Einstellungen')}
            aria-label={text('Open Abitur settings', 'Abitur-Einstellungen öffnen')}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="px-4 lg:px-8 py-2 border-b border-border/30 flex items-center gap-1 overflow-x-auto">
        <TabBtn active={view === 'overview'} onClick={() => setView('overview')}>
          {text('Overview', 'Gesamt')}
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
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-11 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap',
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
  const { text } = useAbiturLocale();
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-[13px] font-medium text-amber-600 dark:text-amber-400">
            {gradesEntered === 0
              ? text('No grades entered yet', 'Noch keine Noten eingetragen')
              : text('Incomplete data', 'Unvollständige Daten')}
          </p>
          <p className="text-[11px] text-muted-foreground/50 mt-1 leading-relaxed">
            {gradesEntered === 0
              ? text(
                  'The calculation becomes meaningful after you enter semester grades. Select a semester above and enter your points.',
                  'Die Berechnung ist erst aussagekräftig, wenn du Noten in den Halbjahren einträgst. Wähle ein Halbjahr oben aus und trage deine Punkte ein.',
                )
              : text(
                  `${gradesEntered} of ${totalPossible} possible grades entered. Forecasts and averages improve with every additional grade.`,
                  `${gradesEntered} von ${totalPossible} möglichen Noten eingetragen. Die Prognose und Schnitte werden mit jeder weiteren Note genauer.`,
                )
            }
          </p>
          {gradesEntered === 0 && onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('12/1')}
              className="mt-3 flex min-h-11 items-center gap-1.5 px-2 text-[12px] font-medium text-amber-600 transition-colors hover:text-amber-500 dark:text-amber-400"
            >
              <PenLine className="h-3 w-3" />
              {text('Enter grades', 'Noten eintragen')}
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
  const { lang, text } = useAbiturLocale();
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
                <p className="text-3xl font-black tabular-nums tracking-tight">{formatAbiturNumber(result.finalGrade, lang, 1)}</p>
                <p className="text-[11px] text-muted-foreground/30 uppercase tracking-widest mt-0.5">{text('Grade', 'Note')}</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-muted-foreground/45">—</p>
                <p className="text-[11px] text-muted-foreground/45 uppercase tracking-widest mt-0.5">{text('No data', 'Keine Daten')}</p>
              </>
            )}
          </div>
        </div>

        {hasData && (
          <p className="text-[12px] text-muted-foreground/40 mt-2 tabular-nums font-mono">
            {result.totalPoints} / {result.maxPoints} {text('points', 'Punkte')}
          </p>
        )}
      </div>

      {/* Notenschnitt — average grades summary */}
      {hasData && (
        <div className="rounded-2xl border border-border/40 p-4">
          <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest mb-3">{text('Grade averages', 'Notenschnitt')}</p>
          {/* Global averages */}
          {(() => {
            const allGrades = (profile.grades ?? []).filter((g) => g.points !== null && g.subjectId !== 'psem');
            const allAvg = allGrades.length > 0 ? allGrades.reduce((s, g) => s + (g.points ?? 0), 0) / allGrades.length : null;
            // Calculate global grade from all eingebrachte across all semesters
            const allEingebrachte = result.semesterStats.flatMap(ss => ss.eingebrachte);
            const globalEinbAvg = allEingebrachte.length > 0 
              ? allEingebrachte.reduce((s, g) => s + (g.points ?? 0), 0) / allEingebrachte.length 
              : null;
            const globalNote = globalEinbAvg !== null ? pointsToDecimalGrade(globalEinbAvg) : null;
            return (
              <>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl bg-foreground/[0.03] p-3">
                    <p className={cn('text-xl font-bold tabular-nums leading-none', globalNote !== null && globalNote <= 2.5 ? 'text-emerald-500' : globalNote !== null && globalNote <= 3.5 ? 'text-amber-500' : globalNote !== null ? 'text-red-400' : '')}>
                      {globalNote !== null ? formatAbiturNumber(globalNote, lang, 2) : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/45 uppercase tracking-wider mt-1.5">{text('Grade', 'Schulnote')}</p>
                  </div>
                  <div className="rounded-xl bg-foreground/[0.03] p-3">
                    <p className="text-xl font-bold tabular-nums leading-none text-emerald-500">
                      {globalEinbAvg !== null ? formatAbiturNumber(globalEinbAvg, lang, 2) : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/45 uppercase tracking-wider mt-1.5">{text('Ø included', 'Ø eingeb.')}</p>
                  </div>
                  <div className="rounded-xl bg-foreground/[0.03] p-3">
                    <p className="text-xl font-bold tabular-nums leading-none">
                      {allAvg !== null ? formatAbiturNumber(allAvg, lang, 2) : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/45 uppercase tracking-wider mt-1.5">{text('Ø points', 'Ø Punkte')}</p>
                  </div>
                </div>
                {/* Per-Halbjahr Schulnoten */}
                {result.semesterStats.some((ss) => ss.enteredCount > 0) && (
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    {result.semesterStats.map((ss) => {
                      const avg = ss.allAverage;
                      const einbAvg = ss.eingebrachteAverage;
                      const grade = ss.eingebrachteGrade;
                      return (
                        <div key={ss.semester} className="rounded-lg bg-foreground/[0.02] p-2 text-center">
                          <p className="text-[11px] text-muted-foreground/30 font-medium mb-1">{SEMESTER_LABELS[ss.semester]}</p>
                          {grade !== null ? (
                            <>
                              <p className={cn('text-[15px] font-bold tabular-nums leading-none', grade <= 2.5 ? 'text-emerald-500' : grade <= 3.5 ? 'text-amber-500' : 'text-red-400')}>
                                {formatAbiturNumber(grade, lang, 2)}
                              </p>
                              <p className="text-[10px] text-emerald-500/70 font-mono mt-0.5">{einbAvg !== null ? formatAbiturNumber(einbAvg, lang, 2) : '—'}{text('I', 'E')}</p>
                              <p className="text-[10px] text-muted-foreground/45 font-mono mt-0.5">{avg !== null ? formatAbiturNumber(avg, lang, 2) : '—'} {text('pts', 'P')}</p>
                            </>
                          ) : (
                            <p className="text-[15px] font-bold text-muted-foreground/45 leading-none">—</p>
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
            <p className="text-[11px] text-muted-foreground/30 uppercase tracking-widest">Block I</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{result.blockI.totalPoints}</p>
            <p className="text-[10px] text-muted-foreground/30 font-mono mt-0.5">/ {result.blockI.maxPoints}</p>
            <p className="text-[11px] text-muted-foreground/45 mt-1">{result.blockI.einbringungCount} {text('included', 'Einbr.')}</p>
          </div>
          <div className={cn(
            'rounded-2xl border p-4 text-center',
            result.blockII.exams.length > 0
              ? result.blockII.passed ? 'border-emerald-500/20 bg-emerald-500/[0.03]' : 'border-red-500/20 bg-red-500/[0.03]'
              : 'border-border/40'
          )}>
            <p className="text-[11px] text-muted-foreground/30 uppercase tracking-widest">Block II</p>
            {result.blockII.exams.length > 0 ? (
              <>
                <p className="text-2xl font-bold tabular-nums mt-1">{result.blockII.totalPoints}</p>
                <p className="text-[10px] text-muted-foreground/30 font-mono mt-0.5">/ {result.blockII.maxPoints}</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-muted-foreground/45 mt-1">—</p>
                <p className="text-[10px] text-muted-foreground/45 mt-0.5">{text('No exams', 'Keine Prüfungen')}</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Einbringungen bar */}
      <button
        type="button"
        onClick={() => onNavigate('einbringungen')}
        className="w-full rounded-2xl border border-border/40 p-4 text-left hover:bg-foreground/[0.02] transition-colors group"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-muted-foreground/30 uppercase tracking-widest">{text('Included results', 'Einbringungen')}</span>
          <div className="flex items-center gap-2">
            <span className={cn('text-[13px] font-bold tabular-nums', einCount === 40 ? 'text-emerald-500' : 'text-red-400')}>
              {einCount}<span className="text-muted-foreground/30 font-normal"> / 40</span>
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/45 group-hover:text-muted-foreground/40 transition-colors" />
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-foreground/[0.05] overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700', einCount === 40 ? 'bg-emerald-500' : 'bg-red-400')}
            style={{ width: `${Math.min(100, (einCount / 40) * 100)}%` }}
          />
        </div>
      </button>

      {/* Semester cards — clickable to navigate */}
      <div>
        <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest mb-3">{text('Semesters', 'Halbjahre')}</p>
        <div className="grid grid-cols-2 gap-3">
          {result.semesterStats.map((ss) => (
            <button
              type="button"
              key={ss.semester}
              onClick={() => onNavigate(ss.semester)}
              className="rounded-2xl border border-border/40 p-4 space-y-3 text-left hover:bg-foreground/[0.02] transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold">{SEMESTER_LABELS[ss.semester]}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground/45 font-mono">
                    {ss.enteredCount}/{ss.totalSubjects}
                  </span>
                  <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/45 group-hover:text-muted-foreground/30 transition-colors" />
                </div>
              </div>
              {ss.enteredCount > 0 ? (
                <>
                  <div className="flex items-end gap-3">
                    {(() => {
                      const einbAvg = ss.eingebrachteAverage;
                      const grade = ss.eingebrachteGrade;
                      if (grade === null) return null;
                      return (
                        <>
                          <div>
                            <p className={cn('text-xl font-bold tabular-nums leading-none', grade <= 2.5 ? 'text-emerald-500' : grade <= 3.5 ? 'text-amber-500' : 'text-red-400')}>
                              {formatAbiturNumber(grade, lang, 2)}
                            </p>
                            <p className="text-[10px] text-muted-foreground/45 uppercase tracking-wider mt-1">{text('Grade', 'Schulnote')}</p>
                          </div>
                          <div className="h-6 w-px bg-border/40" />
                          <div>
                            <p className="text-xl font-bold tabular-nums leading-none text-emerald-500">
                              {einbAvg !== null ? formatAbiturNumber(einbAvg, lang, 2) : '—'}
                            </p>
                            <p className="text-[10px] text-muted-foreground/45 uppercase tracking-wider mt-1">{text('Ø included', 'Ø eingeb.')}</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <p className="text-[11px] text-muted-foreground/45 font-mono mt-1">
                    Ø {ss.allAverage !== null ? formatAbiturNumber(ss.allAverage, lang, 2) : '—'} {text('points', 'Punkte')}
                  </p>
                  {ss.deficits > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] font-mono tabular-nums text-red-400">
                        {text(
                          `${ss.deficits} ${ss.deficits === 1 ? 'deficit' : 'deficits'}`,
                          `${ss.deficits} Defizit${ss.deficits !== 1 ? 'e' : ''}`,
                        )}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground/45 py-1">
                  {text('No grades yet', 'Noch keine Noten')}
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
            <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest">{text('Requirements', 'Hürden')}</p>
            {result.hurdles.every((h) => h.passed) ? (
              <span className="text-[10px] text-emerald-500 font-medium">{text('All met', 'Alle bestanden')}</span>
            ) : (
              <span className="text-[10px] text-red-400 font-medium">
                {result.hurdles.filter((h) => !h.passed).length} {text('open', 'offen')}
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
                <span className="flex-1">{lang === 'de' ? h.label : (ENGLISH_HURDLE_LABELS[h.id] ?? localizeAbiturMessage(h.label, lang))}</span>
                <span className="text-[10px] text-muted-foreground/30 font-mono tabular-nums">{localizeAbiturMessage(h.description, lang)}</span>
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
            <span className="text-[10px] text-muted-foreground/30 uppercase tracking-widest">{text('1.0 forecast', 'Prognose 1,0')}</span>
          </div>
          {(() => {
            const projection = calculateNeededAverage(profile, 1.0);
            return (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-foreground/[0.03] p-3 text-center">
                  <p className={cn('text-xl font-bold tabular-nums', !projection.achievable && 'text-muted-foreground/30')}>
                    {projection.achievable ? formatAbiturNumber(projection.neededBlockIAvg, lang, 1) : '—'}
                  </p>
                  <p className="text-[11px] text-muted-foreground/30 uppercase tracking-wider mt-1">{text('Required grade Ø', 'Ø Noten nötig')}</p>
                </div>
                <div className="rounded-xl bg-foreground/[0.03] p-3 text-center">
                  <p className={cn('text-xl font-bold tabular-nums', !projection.achievable && 'text-muted-foreground/30')}>
                    {projection.achievable ? formatAbiturNumber(projection.neededExamAvg, lang, 1) : '—'}
                  </p>
                  <p className="text-[11px] text-muted-foreground/30 uppercase tracking-wider mt-1">{text('Required exam Ø', 'Ø Prüfungen nötig')}</p>
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
  const { setGrade, toggleEinbringung, addIndividualGrade, updateIndividualGrade, removeIndividualGrade } = useAbiturStore();
  const { lang, text } = useAbiturLocale();
  const subjects = profile.subjects.filter((id) => id !== 'psem');
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Semester header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{SEMESTER_LABELS[semester]}</h2>
          <p className="text-[11px] text-muted-foreground/40">
            {ss.enteredCount === 0
              ? text('Enter your grades here', 'Trage deine Noten hier ein')
              : text(
                  `${ss.enteredCount} of ${ss.totalSubjects} grades entered`,
                  `${ss.enteredCount} von ${ss.totalSubjects} Noten eingetragen`,
                )
            }
          </p>
        </div>
        {ss.enteredCount > 0 && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xl font-bold tabular-nums leading-none">
                {ss.allAverage !== null ? formatAbiturNumber(ss.allAverage, lang, 1) : '—'}
              </p>
              <p className="text-[10px] text-muted-foreground/45 uppercase tracking-wider mt-0.5">{text('Ø points', 'Ø Punkte')}</p>
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
                    {formatAbiturNumber(clamped, lang, 1)}
                  </p>
                  <p className="text-[10px] text-muted-foreground/45 uppercase tracking-wider mt-0.5">{text('Grade', 'Schulnote')}</p>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Empty hint */}
      {ss.enteredCount === 0 && (
        <div className="rounded-xl bg-foreground/[0.02] border border-dashed border-border/40 p-4 text-center">
          <PenLine className="h-4 w-4 text-muted-foreground/45 mx-auto mb-2" />
          <p className="text-[12px] text-muted-foreground/30">
            {text(
              'Select a subject to enter major or minor assessments, or select the point value to enter the semester grade directly.',
              'Klicke auf ein Fach, um Einzelnoten (große/kleine LN) einzutragen, oder direkt auf die Punktzahl für die Halbjahresleistung',
            )}
          </p>
        </div>
      )}

      {/* Compact counters — only show when data exists */}
      {ss.enteredCount > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-lg bg-foreground/[0.03] px-2.5 py-1.5">
            <CircleDot className="h-3 w-3 text-emerald-500" />
            <span className="text-[11px] font-mono tabular-nums">{ss.einbringungCount}</span>
            <span className="text-[10px] text-muted-foreground/30">{text('included', 'eingeb.')}</span>
          </div>
          {ss.deficits > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5">
              <Shield className="h-3 w-3 text-red-400" />
              <span className="text-[11px] font-mono tabular-nums text-red-400">{ss.deficits}</span>
              <span className="text-[10px] text-muted-foreground/30">{text('deficits', 'Defizite')}</span>
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
          const eingebracht = isEingebracht(subjectId, semester, profile);
          const toggle = canToggleSemester(subjectId, semester, profile);
          const isExpanded = expandedSubject === subjectId;
          const individualGrades = (profile.individualGrades ?? []).filter(
            (g) => g.subjectId === subjectId && g.semester === semester
          );
          const hasIndividualGrades = individualGrades.length > 0;
          const grossGrades = individualGrades.filter((g) => g.type === 'gross');
          const kleinGrades = individualGrades.filter((g) => g.type === 'klein');

          return (
            <div key={subjectId}>
              <div
                className={cn(
                  'flex items-center gap-3 px-4 py-3 transition-colors',
                  !eingebracht && pts !== null && 'bg-foreground/[0.01]'
                )}
              >
                {/* Einbringung toggle */}
                <button
                  type="button"
                  onClick={() => toggle.canToggle && toggleEinbringung(subjectId, semester)}
                  disabled={!toggle.canToggle}
                  aria-label={`${subjectName(subj, lang)} ${eingebracht ? text('exclude', 'nicht einbringen') : text('include', 'einbringen')}`}
                  aria-pressed={eingebracht}
                  title={localizeAbiturMessage(toggle.reason, lang)}
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-[5px] border transition-all lg:h-5 lg:w-5',
                    eingebracht
                      ? toggle.canToggle
                        ? 'bg-emerald-500 border-emerald-500 cursor-pointer hover:bg-emerald-600'
                        : 'bg-emerald-500/15 border-emerald-500/30 cursor-not-allowed'
                      : toggle.canToggle
                        ? 'border-emerald-500/40 hover:border-emerald-500 hover:bg-emerald-500/10 cursor-pointer'
                        : 'border-border/30 bg-muted-foreground/5 cursor-not-allowed',
                  )}
                >
                  {eingebracht ? (
                    <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 16 16" fill="none">
                      <path d="M4 8.5L6.5 11L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : toggle.canToggle ? (
                    <Plus className="h-2.5 w-2.5 text-emerald-500/50" />
                  ) : null}
                </button>

                {/* Subject badge — clickable to expand */}
                <button
                  type="button"
                  onClick={() => setExpandedSubject(isExpanded ? null : subjectId)}
                  aria-label={`${subjectName(subj, lang)} ${isExpanded ? text('collapse', 'einklappen') : text('open', 'öffnen')}`}
                  aria-expanded={isExpanded}
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold font-mono transition-all lg:h-7 lg:w-7',
                    FIELD_BG[subj.field],
                    FIELD_COLOR[subj.field],
                    !eingebracht && pts !== null && 'opacity-40',
                    'hover:ring-1 hover:ring-border/40'
                  )}
                >
                  {subjectShortName(subj, lang)}
                </button>

                <button
                  type="button"
                  onClick={() => setExpandedSubject(isExpanded ? null : subjectId)}
                  aria-expanded={isExpanded}
                  className="min-h-11 flex-1 min-w-0 text-left"
                >
                  <p className={cn(
                    'text-[12px] font-medium truncate',
                    !eingebracht && pts !== null && 'text-muted-foreground/40'
                  )}>
                    {subjectName(subj, lang)}
                  </p>
                  {hasIndividualGrades && (
                    <p className="text-[11px] text-muted-foreground/30 mt-0.5">
                      {grossGrades.length > 0 && `${grossGrades.length} ${text('major', 'groß')}`}
                      {grossGrades.length > 0 && kleinGrades.length > 0 && ' · '}
                      {kleinGrades.length > 0 && `${kleinGrades.length} ${text('minor', 'klein')}`}
                    </p>
                  )}
                </button>

                {/* Expand indicator */}
                <button
                  type="button"
                  onClick={() => setExpandedSubject(isExpanded ? null : subjectId)}
                  aria-label={`${subjectName(subj, lang)} ${isExpanded ? text('collapse', 'einklappen') : text('open', 'öffnen')}`}
                  aria-expanded={isExpanded}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground/45 transition-colors hover:bg-foreground/[0.03] hover:text-muted-foreground/40"
                >
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-180')} />
                </button>

                {/* Points display */}
                <PointsInput
                  value={pts}
                  onChange={(v) => setGrade(subjectId, semester, v)}
                  dimmed={!eingebracht && pts !== null}
                  hasIndividualGrades={hasIndividualGrades}
                  label={text(`${subjectName(subj, lang)} semester points`, `${subjectName(subj, lang)} Halbjahrespunktzahl`)}
                />
              </div>

              {/* Expanded: Individual Grades */}
              {isExpanded && (
                <div className="px-4 pb-4 bg-foreground/[0.015]">
                  <IndividualGradesPanel
                    subjectId={subjectId}
                    semester={semester}
                    grossGrades={grossGrades}
                    kleinGrades={kleinGrades}
                    onAdd={(type, points, label) => addIndividualGrade({ subjectId, semester, type, points, label })}
                    onUpdate={updateIndividualGrade}
                    onRemove={removeIndividualGrade}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground/45">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-[3px] bg-emerald-500 flex items-center justify-center">
            <svg className="h-2 w-2 text-white" viewBox="0 0 16 16" fill="none">
              <path d="M4 8.5L6.5 11L12 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span>{text('Included', 'Eingebracht')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-[3px] border border-emerald-500/40 flex items-center justify-center">
            <Plus className="h-1.5 w-1.5 text-emerald-500/50" />
          </div>
          <span>{text('Select to include', 'Zum Einbringen klicken')}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-[3px] border border-border/30 bg-muted-foreground/5" />
          <span>{text('Locked', 'Gesperrt')}</span>
        </div>
        <div className="flex items-center gap-1">
          <FileCheck className="h-3 w-3 text-muted-foreground/30" />
          <span>{text('Major assessments', 'Große LN')}</span>
        </div>
        <div className="flex items-center gap-1">
          <FileText className="h-3 w-3 text-muted-foreground/30" />
          <span>{text('Minor assessments', 'Kleine LN')}</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Individual Grades Panel — große/kleine Leistungsnachweise
// ═══════════════════════════════════════════════════════════

function IndividualGradesPanel({
  grossGrades,
  kleinGrades,
  onAdd,
  onUpdate,
  onRemove,
}: {
  subjectId: string;
  semester: Semester;
  grossGrades: IndividualGrade[];
  kleinGrades: IndividualGrade[];
  onAdd: (type: 'gross' | 'klein', points: number, label?: string) => void;
  onUpdate: (id: string, updates: Partial<IndividualGrade>) => void;
  onRemove: (id: string) => void;
}) {
  const { lang, text } = useAbiturLocale();
  const [addingType, setAddingType] = useState<'gross' | 'klein' | null>(null);
  const [newPoints, setNewPoints] = useState('');
  const [newLabel, setNewLabel] = useState('');

  const grossAvg = grossGrades.length > 0
    ? grossGrades.reduce((s, g) => s + g.points, 0) / grossGrades.length
    : null;
  const kleinAvg = kleinGrades.length > 0
    ? kleinGrades.reduce((s, g) => s + g.points, 0) / kleinGrades.length
    : null;
  const totalAvg = grossAvg !== null && kleinAvg !== null
    ? (grossAvg + kleinAvg) / 2
    : grossAvg ?? kleinAvg;

  const handleAdd = () => {
    const n = parseInt(newPoints);
    if (isNaN(n) || n < 0 || n > 15 || !addingType) return;
    onAdd(addingType, n, newLabel.trim() || undefined);
    setNewPoints('');
    setNewLabel('');
    setAddingType(null);
  };

  return (
    <div className="space-y-3 pt-2">
      {/* Average summary bar */}
      {(grossGrades.length > 0 || kleinGrades.length > 0) && (
        <div className="flex items-center gap-2 rounded-lg bg-background/50 border border-border/30 px-3 py-2">
          <span className="text-[11px] text-muted-foreground/40 uppercase tracking-widest">1:1</span>
          <div className="flex items-center gap-3 flex-1">
            {grossAvg !== null && (
              <div className="flex items-center gap-1.5">
                <FileCheck className="h-3 w-3 text-violet-400/60" />
                <span className="text-[11px] font-mono font-bold tabular-nums">{formatAbiturNumber(grossAvg, lang, 1)}</span>
                <span className="text-[10px] text-muted-foreground/45">{text('Ø major', 'Ø groß')}</span>
              </div>
            )}
            {kleinAvg !== null && (
              <div className="flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-sky-400/60" />
                <span className="text-[11px] font-mono font-bold tabular-nums">{formatAbiturNumber(kleinAvg, lang, 1)}</span>
                <span className="text-[10px] text-muted-foreground/45">{text('Ø minor', 'Ø klein')}</span>
              </div>
            )}
          </div>
          {totalAvg !== null && (
            <div className={cn('text-[13px] font-bold font-mono tabular-nums', getPointsColor(Math.round(totalAvg)))}>
              = {Math.round(totalAvg).toString().padStart(2, '0')}
            </div>
          )}
        </div>
      )}

      {/* Große Leistungsnachweise */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <FileCheck className="h-3 w-3 text-violet-400/60" />
            <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">{text('Major assessments', 'Große LN')}</span>
            <span className="text-[11px] text-muted-foreground/45">({grossGrades.length})</span>
          </div>
          <button
            type="button"
            onClick={() => { setAddingType('gross'); setNewPoints(''); setNewLabel(''); }}
            className="flex min-h-11 items-center gap-1 px-2 text-[10px] text-violet-500 transition-colors hover:text-violet-400"
          >
            <Plus className="h-3 w-3" />
            {text('Add', 'Hinzufügen')}
          </button>
        </div>
        {grossGrades.length > 0 && (
          <div className="space-y-1">
            {grossGrades.map((g) => (
              <GradeRow key={g.id} grade={g} onUpdate={onUpdate} onRemove={onRemove} accent="violet" />
            ))}
          </div>
        )}
        {grossGrades.length === 0 && addingType !== 'gross' && (
          <p className="text-[10px] text-muted-foreground/45 pl-5">{text('No major assessments yet', 'Noch keine großen LN')}</p>
        )}
      </div>

      {/* Kleine Leistungsnachweise */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <FileText className="h-3 w-3 text-sky-400/60" />
            <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">{text('Minor assessments', 'Kleine LN')}</span>
            <span className="text-[11px] text-muted-foreground/45">({kleinGrades.length})</span>
          </div>
          <button
            type="button"
            onClick={() => { setAddingType('klein'); setNewPoints(''); setNewLabel(''); }}
            className="flex min-h-11 items-center gap-1 px-2 text-[10px] text-sky-500 transition-colors hover:text-sky-400"
          >
            <Plus className="h-3 w-3" />
            {text('Add', 'Hinzufügen')}
          </button>
        </div>
        {kleinGrades.length > 0 && (
          <div className="space-y-1">
            {kleinGrades.map((g) => (
              <GradeRow key={g.id} grade={g} onUpdate={onUpdate} onRemove={onRemove} accent="sky" />
            ))}
          </div>
        )}
        {kleinGrades.length === 0 && addingType !== 'klein' && (
          <p className="text-[10px] text-muted-foreground/45 pl-5">{text('No minor assessments yet', 'Noch keine kleinen LN')}</p>
        )}
      </div>

      {/* Add grade inline form */}
      {addingType && (
        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-2">
          <div className={cn(
            'text-[11px] font-bold uppercase tracking-wider shrink-0',
            addingType === 'gross' ? 'text-violet-400' : 'text-sky-400'
          )}>
            {addingType === 'gross' ? text('Major', 'Groß') : text('Minor', 'Klein')}
          </div>
          <input
            autoFocus
            type="text"
            inputMode="numeric"
            aria-label={text('Points for the new assessment', 'Punkte der neuen Einzelnote')}
            placeholder="0-15"
            value={newPoints}
            onChange={(e) => setNewPoints(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="h-11 w-12 rounded-md border border-border/40 bg-transparent py-1 text-center text-[12px] font-mono font-bold focus:border-emerald-500/40 focus:outline-none"
          />
          <input
            type="text"
            aria-label={text('Label for the new assessment', 'Bezeichnung der neuen Einzelnote')}
            placeholder={text('Label (optional)', 'Bezeichnung (optional)')}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="h-11 flex-1 rounded-md border border-border/40 bg-transparent px-2 py-1 text-[11px] placeholder:text-muted-foreground/45 focus:border-emerald-500/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAdd}
            aria-label={text('Add assessment', 'Einzelnote hinzufügen')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-emerald-500 text-white transition-colors hover:bg-emerald-600"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setAddingType(null)}
            aria-label={text('Cancel grade entry', 'Noteneingabe abbrechen')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border/40 text-muted-foreground/40 transition-colors hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Hint about 1:1 weighting */}
      <p className="text-[11px] text-muted-foreground/45 leading-relaxed">
        {text(
          'Major and minor assessments are weighted 1:1 in the semester grade, which is calculated automatically.',
          'Große und kleine LN gehen 1:1 in die Halbjahresleistung ein. Die HJL wird automatisch berechnet.',
        )}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Grade Row — individual grade with edit/delete
// ═══════════════════════════════════════════════════════════

function GradeRow({
  grade,
  onUpdate,
  onRemove,
  accent,
}: {
  grade: IndividualGrade;
  onUpdate: (id: string, updates: Partial<IndividualGrade>) => void;
  onRemove: (id: string) => void;
  accent: 'violet' | 'sky';
}) {
  const { text } = useAbiturLocale();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [tmpPts, setTmpPts] = useState('');
  const gradeDisplayName = grade.label || (grade.type === 'gross'
    ? text('Major assessment', 'Große LN')
    : text('Minor assessment', 'Kleine LN'));

  const startEdit = () => {
    setTmpPts(String(grade.points));
    setEditing(true);
  };

  const commitEdit = () => {
    const n = parseInt(tmpPts);
    if (!isNaN(n) && n >= 0 && n <= 15) {
      onUpdate(grade.id, { points: n });
    }
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 group hover:bg-foreground/[0.02] transition-colors">
      <div className={cn(
        'h-1.5 w-1.5 rounded-full shrink-0',
        accent === 'violet' ? 'bg-violet-400/50' : 'bg-sky-400/50'
      )} />
      <span className="text-[11px] text-muted-foreground/50 flex-1 truncate">
        {gradeDisplayName}
      </span>
      {confirmingDelete ? (
        <div
          role="alert"
          aria-live="assertive"
          aria-label={text(`Confirm deletion of ${gradeDisplayName}`, `Löschen von ${gradeDisplayName} bestätigen`)}
          className="flex items-center gap-1"
        >
          <span className="text-[10px] font-medium text-red-500">{text('Delete?', 'Löschen?')}</span>
          <button
            autoFocus
            type="button"
            onClick={() => setConfirmingDelete(false)}
            aria-label={text('Cancel deletion', 'Löschen abbrechen')}
            className="flex h-7 min-h-11 w-11 items-center justify-center rounded-md border border-border/50 text-muted-foreground hover:text-foreground lg:min-h-7 lg:w-7"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(grade.id)}
            aria-label={text(`Delete ${gradeDisplayName}`, `${gradeDisplayName} löschen`)}
            className="flex h-7 min-h-11 w-11 items-center justify-center rounded-md bg-red-500/10 text-red-500 hover:bg-red-500/20 lg:min-h-7 lg:w-7"
          >
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          {editing ? (
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              aria-label={`${gradeDisplayName}: ${text('edit points', 'Punkte bearbeiten')}`}
              value={tmpPts}
              onChange={(e) => setTmpPts(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
              onBlur={commitEdit}
              onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
              className="h-11 w-11 rounded border border-emerald-500/40 bg-background text-center text-[11px] font-mono font-bold focus:outline-none lg:h-6 lg:w-10"
            />
          ) : (
            <button
              type="button"
              onClick={startEdit}
              aria-label={text(
                `Edit ${gradeDisplayName} with ${grade.points} points`,
                `${gradeDisplayName} mit ${grade.points} Punkten bearbeiten`,
              )}
              className={cn(
                'h-11 w-11 rounded text-center text-[11px] font-mono font-bold transition-all hover:ring-1 hover:ring-border/40 lg:h-6 lg:w-10',
                getPointsBg(grade.points),
                getPointsColor(grade.points),
              )}
            >
              {grade.points.toString().padStart(2, '0')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            aria-label={text(`Delete ${gradeDisplayName}`, `${gradeDisplayName} löschen`)}
            title={text('Delete assessment', 'Einzelnote löschen')}
            className="reveal-action flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-60 transition-[opacity,color,background-color] hover:bg-red-500/10 hover:text-red-500 focus-visible:opacity-100 lg:h-7 lg:w-7 lg:opacity-0"
          >
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Points Input — inline, clean
// ═══════════════════════════════════════════════════════════

function PointsInput({
  value,
  onChange,
  dimmed,
  hasIndividualGrades,
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  dimmed?: boolean;
  hasIndividualGrades?: boolean;
  label?: string;
}) {
  const { text } = useAbiturLocale();
  const [editing, setEditing] = useState(false);
  const [tmp, setTmp] = useState('');
  const accessibleLabel = label ?? text('Points', 'Punkte');

  const startEdit = () => {
    if (hasIndividualGrades) return; // auto-calculated from individual grades
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
        aria-label={text(`Edit ${accessibleLabel}`, `${accessibleLabel} bearbeiten`)}
        value={tmp}
        onChange={(e) => setTmp(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="h-11 w-11 rounded-lg border border-emerald-500/40 bg-background text-center text-[13px] font-mono font-bold focus:outline-none lg:h-8"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      aria-label={hasIndividualGrades
        ? text(`${accessibleLabel}, calculated automatically from assessments`, `${accessibleLabel}, automatisch aus Einzelnoten berechnet`)
        : text(`Edit ${accessibleLabel}, ${value ?? 'not entered'}`, `${accessibleLabel} ${value ?? 'nicht eingetragen'} bearbeiten`)}
      title={hasIndividualGrades ? text('Calculated automatically from assessments', 'Automatisch berechnet aus Einzelnoten') : undefined}
      className={cn(
        'h-11 w-11 rounded-lg text-center text-[13px] font-mono font-bold transition-all lg:h-8',
        !hasIndividualGrades && 'hover:ring-1 hover:ring-border/40',
        value !== null ? getPointsBg(value) : 'bg-foreground/[0.03]',
        value !== null ? getPointsColor(value) : 'text-muted-foreground/45',
        dimmed && 'opacity-40',
        hasIndividualGrades && 'cursor-default ring-1 ring-border/20'
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
  const { lang, text } = useAbiturLocale();
  const [selectionError, setSelectionError] = useState('');

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
    if (id === profile.leistungsfach || profile.examSubjects.includes(id)) {
      setSelectionError(text(
        `${subjectName(getSubject(id), lang)} is protected because it is an exam subject.`,
        `${subjectName(getSubject(id), lang)} ist geschützt, weil es ein Prüfungsfach ist.`,
      ));
      return;
    }

    if (profile.subjects.includes(id)) {
      setSubjects(profile.subjects.filter((s) => s !== id));
      setSelectionError('');
    } else {
      const result = selectSubjectWithExclusivity(
        [...profile.subjects, id],
        id,
        [profile.leistungsfach, ...profile.examSubjects],
      );
      if (result.blockedBy) {
        setSelectionError(text(
          `${subjectName(getSubject(id), lang)} cannot replace protected exam subject ${subjectName(getSubject(result.blockedBy), lang)}.`,
          `${subjectName(getSubject(id), lang)} kann das geschützte Prüfungsfach ${subjectName(getSubject(result.blockedBy), lang)} nicht ersetzen.`,
        ));
        return;
      }
      setSubjects(result.subjects);
      setSelectionError('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[13px] font-medium">{text('Manage subjects', 'Fächer verwalten')}</p>
        <p className="text-[11px] text-muted-foreground/40 mt-1">
          {text(
            `${profile.subjects.length} subjects selected · Required, advanced and exam subjects cannot be removed`,
            `${profile.subjects.length} Fächer gewählt · Pflicht-, LF- und Prüfungsfächer können nicht entfernt werden`,
          )}
        </p>
      </div>
      {selectionError && (
        <p role="alert" className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-600 dark:text-amber-300">
          {selectionError}
        </p>
      )}

      {/* Currently selected — Pflicht */}
      <SGroup title={text('Required subjects (fixed)', 'Pflichtfächer (fest)')}>
        {MANDATORY_IDS.map((id) => {
          const s = getSubject(id);
          if (!s) return null;
          return (
            <div key={id} className="flex items-center gap-3 px-4 py-3">
              <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center text-[11px] font-bold font-mono shrink-0', FIELD_BG[s.field], FIELD_COLOR[s.field])}>
                {subjectShortName(s, lang)}
              </div>
              <span className="text-[12px] font-medium flex-1">{subjectName(s, lang)}</span>
              <Lock className="h-3 w-3 text-muted-foreground/45" />
            </div>
          );
        })}
      </SGroup>

      {/* Optional subjects by category */}
      {Object.entries(grouped).map(([cat, subs]) => (
        <SGroup key={cat} title={CATEGORY_LABELS[lang][cat] || cat}>
          {subs.map((s) => {
            const active = profile.subjects.includes(s.id);
            const locked = s.id === profile.leistungsfach || profile.examSubjects.includes(s.id);
            // Show which exclusive subject would be replaced
            const exclusiveGroup = EXCLUSIVE_GROUPS.find((g) => g.includes(s.id));
            const wouldReplace = !active && exclusiveGroup
              ? exclusiveGroup.find((id) => id !== s.id && profile.subjects.includes(id))
              : undefined;
            const replacementSubject = wouldReplace ? getSubject(wouldReplace) : undefined;
            const replaceName = replacementSubject ? subjectShortName(replacementSubject, lang) : undefined;
            const protectedConflict = Boolean(
              wouldReplace
              && (wouldReplace === profile.leistungsfach || profile.examSubjects.includes(wouldReplace)),
            );
            return (
              <button
                type="button"
                key={s.id}
                onClick={() => toggle(s.id)}
                disabled={locked || protectedConflict}
                aria-pressed={active}
                title={protectedConflict && replacementSubject
                  ? text(
                      `Cannot replace protected exam subject ${subjectName(replacementSubject, lang)}`,
                      `Geschütztes Prüfungsfach ${subjectName(replacementSubject, lang)} kann nicht ersetzt werden`,
                    )
                  : undefined}
                className={cn(
                  'w-full min-h-11 flex items-center gap-3 px-4 py-3 text-left transition-colors',
                  active ? 'hover:bg-foreground/[0.02]' : 'opacity-40 hover:opacity-60',
                  (locked || protectedConflict) && 'cursor-not-allowed'
                )}
              >
                <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center text-[11px] font-bold font-mono shrink-0', FIELD_BG[s.field], FIELD_COLOR[s.field])}>
                  {subjectShortName(s, lang)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-medium truncate">{subjectName(s, lang)}</span>
                    {s.lateStart && (
                      <span className="text-[10px] text-amber-500 bg-amber-500/10 px-1 py-0.5 rounded font-medium shrink-0">{text('late', 'spät')}</span>
                    )}
                    {s.requiresAdditum && (
                      <span className="text-[10px] text-violet-400 bg-violet-500/10 px-1 py-0.5 rounded font-medium shrink-0">Add.</span>
                    )}
                  </div>
                  {replaceName && (
                    <span className={cn('text-[11px]', protectedConflict ? 'text-red-400/70' : 'text-amber-500/50')}>
                      {protectedConflict
                        ? text(`Protected: ${replaceName}`, `Geschützt: ${replaceName}`)
                        : text(`Replaces ${replaceName}`, `Ersetzt ${replaceName}`)}
                    </span>
                  )}
                </div>
                {locked ? (
                  <Lock className="h-3 w-3 text-muted-foreground/45" />
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
  const { toggleEinbringung, autoOptimizeEinbringungen, selectAll, deselectAll } = useAbiturStore();
  const { lang, text } = useAbiturLocale();
  const einCount = countAllEinbringungen(profile);
  const subjects = profile.subjects.filter((id) => id !== 'psem');

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[13px] font-medium">{text('Manage included results', 'Einbringungen verwalten')}</p>
        <p className="text-[11px] text-muted-foreground/40 mt-1">
          {text('Choose which semester results are included in Block I', 'Wähle welche Halbjahresleistungen in Block I eingehen')}
        </p>
      </div>

      {/* Counter bar */}
      <div className="rounded-2xl border border-border/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-muted-foreground/30 uppercase tracking-widest">{text('Total', 'Gesamt')}</span>
          <span className={cn('text-[13px] font-bold tabular-nums', einCount === 40 ? 'text-emerald-500' : 'text-red-400')}>
            {einCount}<span className="text-muted-foreground/30 font-normal"> / 40</span>
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-foreground/[0.05] overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-700', einCount === 40 ? 'bg-emerald-500' : 'bg-red-400')}
            style={{ width: `${Math.min(100, (einCount / 40) * 100)}%` }}
          />
        </div>
        {einCount < 40 && (
          <p className="text-[10px] text-red-400/60 mt-2">
            {text(
              `${40 - einCount} more included ${40 - einCount === 1 ? 'result is' : 'results are'} required`,
              `Noch ${40 - einCount} Einbringungen nötig — zu wenig!`,
            )}
          </p>
        )}
        {einCount > 40 && (
          <p className="text-[10px] text-red-400/60 mt-2">
            {text(
              `Remove ${einCount - 40} included ${einCount - 40 === 1 ? 'result' : 'results'}`,
              `${einCount - 40} Einbringung${einCount - 40 !== 1 ? 'en' : ''} zu viel — bitte streichen`,
            )}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={selectAll}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border/40 bg-foreground/[0.02] p-3 text-[11px] font-medium text-muted-foreground/60 hover:bg-foreground/[0.05] transition-colors active:scale-[0.98]"
        >
          <Plus className="h-3.5 w-3.5" />
          {text('All', 'Alle')}
        </button>
        <button
          type="button"
          onClick={deselectAll}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border/40 bg-foreground/[0.02] p-3 text-[11px] font-medium text-muted-foreground/60 hover:bg-foreground/[0.05] transition-colors active:scale-[0.98]"
        >
          <X className="h-3.5 w-3.5" />
          {text('Required only', 'Nur Pflicht')}
        </button>
        <button
          type="button"
          onClick={autoOptimizeEinbringungen}
          className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/[0.08] transition-colors active:scale-[0.98]"
        >
          <Wand2 className="h-3.5 w-3.5" />
          {text('Optimize', 'Optimieren')}
        </button>
      </div>

      {/* Subject × Semester grid */}
      <div className="rounded-2xl border border-border/40 overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-0 border-b border-border/30 bg-foreground/[0.02]">
          <div className="w-[140px] px-4 py-2.5">
            <span className="text-[11px] text-muted-foreground/30 uppercase tracking-widest">{text('Subject', 'Fach')}</span>
          </div>
          {SEMESTERS.map((sem) => (
            <div key={sem} className="flex-1 text-center py-2.5">
              <span className="text-[11px] text-muted-foreground/30 uppercase tracking-widest">{SEMESTER_LABELS[sem]}</span>
            </div>
          ))}
        </div>

        {/* Subject rows */}
        {subjects.map((subjectId) => {
          const subj = getSubject(subjectId);
          if (!subj) return null;
          const mandatory = isMandatory(subjectId, profile);
          const currentEingebracht = SEMESTERS.filter((s) => isEingebracht(subjectId, s, profile)).length;

          return (
            <div key={subjectId} className="flex items-center gap-0 border-b border-border/30 last:border-b-0">
              <div className="w-[140px] px-4 py-2.5 flex items-center gap-2">
                <div className={cn('h-5 w-5 rounded flex items-center justify-center text-[10px] font-bold font-mono shrink-0', FIELD_BG[subj.field], FIELD_COLOR[subj.field])}>
                  {subjectShortName(subj, lang)}
                </div>
                <div className="min-w-0">
                  <span className="text-[11px] truncate block">{subjectName(subj, lang)}</span>
                  <span className={cn(
                    'text-[10px] block',
                    mandatory ? 'text-muted-foreground/40' : 'text-muted-foreground/30'
                  )}>
                    {mandatory ? text('Required', 'Pflicht') : `${currentEingebracht}/4`}
                  </span>
                </div>
              </div>
              {SEMESTERS.map((sem) => {
                const grade = (profile.grades ?? []).find((g) => g.subjectId === subjectId && g.semester === sem);
                const pts = grade?.points ?? null;
                const eingebracht = isEingebracht(subjectId, sem, profile);
                const toggle = canToggleSemester(subjectId, sem, profile);

                return (
                  <div key={sem} className="flex-1 flex justify-center py-2.5">
                    <button
                      type="button"
                      onClick={() => toggle.canToggle && toggleEinbringung(subjectId, sem)}
                      disabled={!toggle.canToggle}
                      aria-label={`${subjectName(subj, lang)}, ${SEMESTER_LABELS[sem]}: ${eingebracht ? text('exclude', 'nicht einbringen') : text('include', 'einbringen')}`}
                      aria-pressed={eingebracht}
                      title={localizeAbiturMessage(toggle.reason, lang)}
                      className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-lg text-[11px] font-mono font-bold transition-all lg:h-7 lg:w-10',
                        eingebracht
                          ? toggle.isMandatory
                            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 cursor-not-allowed'
                            : 'bg-emerald-500 text-white hover:bg-emerald-600 cursor-pointer'
                          : toggle.canToggle
                            ? pts !== null
                              ? 'bg-foreground/[0.03] text-muted-foreground/40 border border-dashed border-emerald-500/30 hover:bg-emerald-500/10 hover:border-emerald-500/40 hover:text-emerald-600 cursor-pointer'
                              : 'text-muted-foreground/45 border border-dashed border-border/30 hover:border-emerald-500/30 hover:text-emerald-600/40 cursor-pointer'
                            : 'text-muted-foreground/10 cursor-default'
                      )}>
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
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground/45">
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-6 rounded bg-emerald-500 text-[10px] text-white font-mono flex items-center justify-center">08</div>
          <span>{text('Included', 'Eingebracht')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-6 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-500 font-mono flex items-center justify-center">08</div>
          <span>{text('Required', 'Pflicht')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-6 rounded bg-foreground/[0.03] border border-dashed border-emerald-500/30 text-[10px] text-muted-foreground/40 font-mono flex items-center justify-center">08</div>
          <span>{text('Can include', 'Einbringbar')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-6 rounded bg-muted-foreground/5 border border-border/40 text-[10px] text-muted-foreground/45 font-mono flex items-center justify-center">08</div>
          <span>{text('Locked', 'Gesperrt')}</span>
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
  const { lang, text } = useAbiturLocale();

  return (
    <div>
      <p className="text-[10px] text-muted-foreground/30 uppercase tracking-widest mb-3">{text('Abitur exams', 'Abiturprüfungen')}</p>
      <div className="rounded-2xl border border-border/40 divide-y divide-border/30">
        {profile.exams.map((exam, i) => {
          const s = getSubject(exam.subjectId);
          if (!s) return (
            <div key={i} className="flex items-center justify-between px-4 py-3 text-[12px] text-muted-foreground/45">
              <span>{text(`Exam ${i + 1} — not selected`, `${i + 1}. Prüfung — nicht gewählt`)}</span>
            </div>
          );
          return (
            <div key={exam.subjectId} className="flex items-center gap-3 px-4 py-3">
              <div className={cn(
                'h-7 w-7 rounded-lg flex items-center justify-center text-[11px] font-bold font-mono shrink-0',
                FIELD_BG[s.field], FIELD_COLOR[s.field]
              )}>
                {subjectShortName(s, lang)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium truncate">{subjectName(s, lang)}</p>
                <p className="text-[10px] text-muted-foreground/30">
                  {exam.examType === 'written' ? text('Written', 'Schriftlich') : text('Oral exam', 'Kolloquium')}
                </p>
              </div>
              <PointsInput
                value={exam.points}
                onChange={(v) => setExamPoints(i, v)}
                label={text(`${subjectName(s, lang)} exam points`, `${subjectName(s, lang)} Prüfungspunkte`)}
              />
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
  const { lang, text } = useAbiturLocale();
  const {
    setStudentName, setSchoolYear, setCurrentSemester, setLeistungsfach,
    setExamSubject, setSeminarTopic, setSeminarPaperPoints,
    setSeminarPresentationPoints, resetProfile, setSubstitutedWritten,
  } = useAbiturStore();

  const [confirmReset, setConfirmReset] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const lfOptions = ALL_SUBJECTS.filter((s) => s.canBeLF && profile.subjects.includes(s.id));

  return (
    <div className="space-y-6">
      <SGroup title={text('Personal', 'Persönlich')}>
        <SField label={text('Name', 'Name')}>
          <input
            value={profile.studentName}
            onChange={(e) => setStudentName(e.target.value)}
            aria-label={text('Name', 'Name')}
            placeholder={text('Your name', 'Dein Name')}
            className="min-h-11 w-full bg-transparent text-[13px] text-right outline-none placeholder:text-muted-foreground/45"
          />
        </SField>
        <SField label={text('School year', 'Schuljahr')}>
          <input
            value={profile.schoolYear}
            onChange={(e) => setSchoolYear(e.target.value)}
            aria-label={text('School year', 'Schuljahr')}
            placeholder="2025/2027"
            className="min-h-11 w-full bg-transparent text-[13px] text-right font-mono outline-none placeholder:text-muted-foreground/45"
          />
        </SField>
        <SField label={text('Current semester', 'Aktuelles Halbjahr')}>
          <select
            value={profile.currentSemester}
            onChange={(e) => setCurrentSemester(e.target.value as Semester)}
            aria-label={text('Current semester', 'Aktuelles Halbjahr')}
            className="min-h-11 bg-transparent text-[13px] outline-none text-right"
          >
            {SEMESTERS.map((s) => (
              <option key={s} value={s}>{SEMESTER_LABELS[s]}</option>
            ))}
          </select>
        </SField>
      </SGroup>

      <SGroup title={text('Advanced subject', 'Leistungsfach')}>
        <SField label={text('Third written exam', '3. Schriftliches')}>
          <select
            value={profile.leistungsfach}
            onChange={(e) => {
              const accepted = setLeistungsfach(e.target.value);
              setSelectionError(accepted ? '' : text(
                'This advanced-subject choice conflicts with a protected exam subject.',
                'Dieses Leistungsfach steht im Konflikt mit einem geschützten Prüfungsfach.',
              ));
            }}
            aria-label={text('Advanced subject', 'Leistungsfach')}
            className="min-h-11 bg-transparent text-[13px] outline-none text-right"
          >
            {lfOptions.map((s) => {
              const v = canSubjectBeLF(s.id);
              const conflictingExam = profile.examSubjects
                .slice(3, 5)
                .find((examId) => subjectsConflict(s.id, examId));
              const disabled = !v.valid || Boolean(conflictingExam);
              return (
                <option key={s.id} value={s.id} disabled={disabled}>
                  {subjectName(s, lang)}
                  {!v.valid
                    ? ` (${localizeAbiturMessage(v.reason, lang)})`
                    : conflictingExam
                      ? ` (${text(`conflicts with ${subjectName(getSubject(conflictingExam), lang)}`, `Konflikt mit ${subjectName(getSubject(conflictingExam), lang)}`)})`
                      : s.requiresAdditum ? ' (Additum)' : ''}
                </option>
              );
            })}
          </select>
        </SField>
      </SGroup>

      <SGroup title={text('Exam subjects', 'Prüfungsfächer')}>
        {profile.examSubjects.map((sid, i) => {
          // Determine which subjects are unavailable for this slot
          const otherKolloq = i === 3 ? profile.examSubjects[4] : i === 4 ? profile.examSubjects[3] : '';
          const usedIds = new Set(['deu', 'mat', profile.leistungsfach, 'wsem', 'psem']);
          if (otherKolloq) usedIds.add(otherKolloq);

          return (
            <SField key={i} label={text(
              `${i + 1}. ${i < 3 ? 'Written' : 'Oral'}`,
              `${i + 1}. ${i < 3 ? 'Schriftl.' : 'Kolloquium'}`,
            )}>
              {i < 3 ? (
                <span className="text-[13px] text-muted-foreground/50">{subjectName(getSubject(sid), lang) || '—'}</span>
              ) : (
                <select
                  value={sid}
                  onChange={(e) => {
                    const accepted = setExamSubject(i, e.target.value);
                    setSelectionError(accepted ? '' : text(
                      'This exam subject is unavailable or conflicts with another protected exam subject.',
                      'Dieses Prüfungsfach ist nicht verfügbar oder steht im Konflikt mit einem anderen geschützten Prüfungsfach.',
                    ));
                  }}
                  aria-label={text(`Exam subject ${i + 1}`, `${i + 1}. Prüfungsfach`)}
                  className="min-h-11 bg-transparent text-[13px] outline-none text-right"
                >
                  <option value="">{text('Select...', 'Wählen...')}</option>
                  {profile.subjects
                    .filter((id) => !usedIds.has(id))
                    .map((id) => {
                      const s = getSubject(id);
                      if (!s) return null;
                      const oral = canSubjectBeOralExam(id);
                      // Check exclusive group conflict with the other Kolloquium
                      const exclusiveConflict = subjectsConflict(id, otherKolloq)
                        || subjectsConflict(id, profile.leistungsfach);
                      const disabled = !oral.valid || exclusiveConflict;
                      return (
                        <option key={id} value={id} disabled={disabled}>
                          {subjectName(s, lang)}{disabled ? ` (${localizeAbiturMessage(oral.reason || 'Konflikt', lang)})` : ''}
                        </option>
                      );
                    })}
                </select>
              )}
            </SField>
          );
        })}
        {selectionError && (
          <p role="alert" className="px-4 py-3 text-[11px] text-red-400">
            {selectionError}
          </p>
        )}
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
                  <AlertTriangle className="h-2.5 w-2.5 shrink-0" />{localizeAbiturMessage(err, lang)}
                </p>
              ))}
              {validation.warnings.map((w, i) => (
                <p key={i} className="text-[10px] text-amber-500/70 flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5 shrink-0" />{localizeAbiturMessage(w, lang)}
                </p>
              ))}
            </div>
          );
        })()}
      </SGroup>

      {/* Joker / Substitution Rule */}
      <SGroup title={text('Substitution rule', 'Joker-Regel')}>
        <div className="px-4 py-3 space-y-2">
          <p className="text-[11px] text-muted-foreground/40 leading-relaxed">
            {text(
              'Replace German or Mathematics as a required written exam. This requires two continued foreign languages (for German) or two natural sciences (for Mathematics).',
              'Ersetze Deutsch oder Mathe als Pflicht-Schriftliche. Voraussetzung: 2 fortgeführte FS (für Deutsch) oder 2 NW (für Mathe).',
            )}
          </p>
          <div className="flex items-center gap-2">
            {([null, 'deu', 'mat'] as const).map((opt) => (
              <button
                type="button"
                key={opt ?? 'none'}
                onClick={() => setSubstitutedWritten(opt)}
                className={cn(
                  'min-h-11 flex-1 rounded-xl py-2 text-[11px] font-medium transition-all border',
                  (profile.substitutedWritten ?? null) === opt
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                    : 'border-border/40 text-muted-foreground/40 hover:text-foreground/70'
                )}
              >
                {opt === null
                  ? text('No substitution', 'Kein Joker')
                  : opt === 'deu'
                    ? text('Replace German', 'Deutsch ersetzen')
                    : text('Replace Mathematics', 'Mathe ersetzen')}
              </button>
            ))}
          </div>
          {profile.substitutedWritten && (
            <p className="text-[10px] text-amber-500/60 flex items-center gap-1">
              <Replace className="h-3 w-3" />
              {profile.substitutedWritten === 'deu'
                ? text('German will be taken as an oral exam', 'Deutsch wird als mündliches Prüfungsfach (Kolloquium) abgelegt')
                : text('Mathematics will be taken as an oral exam', 'Mathematik wird als mündliches Prüfungsfach (Kolloquium) abgelegt')
              }
            </p>
          )}
        </div>
      </SGroup>

      <SGroup title="W-Seminar">
        <SField label={text('Topic', 'Thema')}>
          <input
            value={profile.seminarTopicTitle}
            onChange={(e) => setSeminarTopic(e.target.value)}
            aria-label={text('Seminar topic', 'Seminarthema')}
            placeholder={text('Seminar topic', 'Seminarthema')}
            className="min-h-11 w-full bg-transparent text-[13px] text-right outline-none placeholder:text-muted-foreground/45"
          />
        </SField>
        <SField label={text('Seminar paper', 'Seminararbeit')}>
          <PointsInput
            value={profile.seminarPaperPoints}
            onChange={setSeminarPaperPoints}
            label={text('Seminar paper points', 'Punkte der Seminararbeit')}
          />
        </SField>
        <SField label={text('Presentation', 'Präsentation')}>
          <PointsInput
            value={profile.seminarPresentationPoints}
            onChange={setSeminarPresentationPoints}
            label={text('Presentation points', 'Präsentationspunkte')}
          />
        </SField>
      </SGroup>

      <div className="rounded-2xl border border-red-500/10 p-4">
        {confirmReset ? (
          <div
            role="alert"
            aria-live="assertive"
            className="flex flex-wrap items-center gap-2 sm:gap-3"
          >
            <p className="text-[12px] text-red-400 flex-1">{text('Permanently delete all Abitur data?', 'Alle Daten unwiderruflich löschen?')}</p>
            <button
              type="button"
              onClick={() => { resetProfile(); setConfirmReset(false); }}
              aria-label={text('Permanently delete all Abitur data', 'Alle Abitur-Daten unwiderruflich löschen')}
              className="min-h-11 rounded-lg bg-red-500/10 px-3 text-[12px] font-medium text-red-500 transition-colors hover:bg-red-500/20 sm:min-h-9"
            >
              {text('Delete', 'Löschen')}
            </button>
            <button
              autoFocus
              type="button"
              onClick={() => setConfirmReset(false)}
              aria-label={text('Cancel data reset', 'Zurücksetzen der Daten abbrechen')}
              className="min-h-11 rounded-lg px-3 text-[12px] text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground sm:min-h-9"
            >
              {text('Cancel', 'Abbrechen')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="min-h-11 rounded-lg px-1 text-[12px] text-red-400 transition-colors hover:text-red-300 sm:min-h-9"
          >
            {text('Reset all data', 'Alle Daten zurücksetzen')}
          </button>
        )}
      </div>
    </div>
  );
}

function SGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground/30 uppercase tracking-widest mb-2">{title}</p>
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
