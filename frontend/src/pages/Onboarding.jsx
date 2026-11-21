import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import TagInput from '../components/TagInput.jsx';
import UserName from '../components/VerifiedBadge.jsx';
import VerifyEmail from '../components/VerifyEmail.jsx';
import PhotoPicker from '../components/PhotoPicker.jsx';
import { GOAL_HINTS, GOAL_LABELS, YEARS, academicLine, firstName } from '../lib/profile.js';
import { useOptions } from '../lib/useOptions.js';

const STEPS = ['verify', 'photo', 'study', 'goals', 'interests', 'prompt'];

/** Account setup after sign-up: verify, then five short profile steps, then a finish screen. */
export default function Onboarding() {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const options = useOptions();
  const [step, setStep] = useState(user.isVerified ? 1 : 0);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    programme: user.programme ?? '',
    yearOfStudy: user.yearOfStudy ?? '',
    goals: user.goals ?? [],
    interests: user.interests ?? [],
    skills: user.skills ?? [],
    promptQuestion: user.prompts?.[0]?.question ?? '',
    promptAnswer: user.prompts?.[0]?.answer ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const toggleGoal = (g) => set('goals')(form.goals.includes(g) ? form.goals.filter((x) => x !== g) : [...form.goals, g]);

  const current = STEPS[step];
  const canContinue = {
    verify: true,
    photo: true,
    study: Boolean(form.programme.trim() && form.yearOfStudy),
    goals: form.goals.length > 0,
    interests: form.interests.length + form.skills.length > 0,
    prompt: !form.promptQuestion || form.promptAnswer.trim().length > 0,
  }[current];

  async function save() {
    setSaving(true);
    setError('');
    try {
      const prompts = form.promptQuestion && form.promptAnswer.trim() ? [{ question: form.promptQuestion, answer: form.promptAnswer }] : [];
      await updateProfile({
        programme: form.programme,
        yearOfStudy: form.yearOfStudy ? Number(form.yearOfStudy) : null,
        goals: form.goals,
        interests: form.interests,
        skills: form.skills,
        ...(prompts.length && { prompts }),
      });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const next = () => (step === STEPS.length - 1 ? save() : setStep(step + 1));

  if (done) {
    return (
      <div className="onboarding onboarding-done">
        <div className="onboarding-body">
          <div className="done-card">
            <Avatar user={user} size={88} />
            <h2>
              <UserName user={user} size={22} />
            </h2>
            <p className="muted">{academicLine(user)}</p>
            <ul className="chips" style={{ justifyContent: 'center' }}>
              {user.goals.map((g) => (
                <li key={g} className="chip chip-goal">
                  {GOAL_LABELS[g]}
                </li>
              ))}
            </ul>
          </div>
          <h1>You’re all set, {firstName(user.name)}</h1>
          <p className="muted">
            Your profile is ready. We’ve lined up students you’re likely to click with.
            {!user.isVerified && ' You can verify your UTG email any time from your profile to get the blue tick.'}
          </p>
        </div>
        <div className="onboarding-footer">
          <button type="button" className="btn btn-primary" onClick={() => navigate('/matches', { replace: true })}>
            See my matches
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding">
      <div className="onboarding-top">
        {step > 0 ? (
          <button type="button" className="icon-button" aria-label="Back" onClick={() => setStep(step - 1)}>
            <Icon name="back" />
          </button>
        ) : (
          <span style={{ width: 44 }} />
        )}
        <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <span key={s} className={i <= step ? 'is-done' : undefined} />
          ))}
        </div>
        <button type="button" className="link-button" onClick={() => navigate('/', { replace: true })}>
          Skip setup
        </button>
      </div>

      <div className="onboarding-body">
        <p className="step-count">
          Step {step + 1} of {STEPS.length}
        </p>

        {current === 'verify' && (
          <>
            <h1>Get your blue tick</h1>
            <p className="muted">Verify your UTG email so other students know you’re really on campus. It takes under a minute.</p>
            <VerifyEmail compact onVerified={() => setTimeout(() => setStep(1), 900)} />
          </>
        )}

        {current === 'photo' && (
          <>
            <h1>Add a profile photo</h1>
            <p className="muted">Profiles with a clear photo of your face get far more connection requests. You can change it any time.</p>
            <PhotoPicker size={150} />
          </>
        )}

        {current === 'study' && (
          <>
            <h1>Welcome, {firstName(user.name)}. What do you study?</h1>
            <p className="muted">We use this to introduce you to classmates and to students in other programmes.</p>
            <div className="field">
              <label htmlFor="ob-programme">Programme</label>
              <input id="ob-programme" list="ob-programmes" placeholder="e.g. Computer Science" value={form.programme} onChange={(e) => set('programme')(e.target.value)} />
              <datalist id="ob-programmes">
                {options?.programmes.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label">Year of study</legend>
              <div className="year-picker">
                {YEARS.slice(0, 5).map((y) => (
                  <label key={y}>
                    <input type="radio" name="year" value={y} checked={Number(form.yearOfStudy) === y} onChange={() => set('yearOfStudy')(y)} />
                    {y}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {current === 'goals' && (
          <>
            <h1>What are you looking for?</h1>
            <p className="muted">Choose as many as you like. Students with the same goals rank higher in your matches.</p>
            <fieldset className="choice-grid">
              <legend className="visually-hidden">Connection goals</legend>
              {Object.entries(GOAL_LABELS).map(([goal, label]) => (
                <label key={goal} className="choice">
                  <input type="checkbox" checked={form.goals.includes(goal)} onChange={() => toggleGoal(goal)} />
                  <span>
                    {label}
                    <small>{GOAL_HINTS[goal]}</small>
                  </span>
                </label>
              ))}
            </fieldset>
          </>
        )}

        {current === 'interests' && (
          <>
            <h1>What are you into?</h1>
            <p className="muted">Add a few interests and skills. Tap a suggestion or type your own.</p>
            <TagInput label="Interests" value={form.interests} onChange={set('interests')} suggestions={options?.interests} />
            <TagInput label="Skills" value={form.skills} onChange={set('skills')} suggestions={options?.skills} hint="Things you can do or help others with." />
          </>
        )}

        {current === 'prompt' && (
          <>
            <h1>Give people something to reply to</h1>
            <p className="muted">Pick a prompt and answer it. It shows on your profile and makes the first message easier. This step is optional.</p>
            <div className="choice-grid">
              {(options?.prompts ?? []).slice(0, 5).map((p) => (
                <label key={p} className="choice">
                  <input type="radio" name="prompt" checked={form.promptQuestion === p} onChange={() => set('promptQuestion')(p)} />
                  {p}
                </label>
              ))}
            </div>
            {form.promptQuestion && (
              <div className="field" style={{ marginTop: '1rem' }}>
                <label htmlFor="ob-answer">Your answer</label>
                <textarea id="ob-answer" rows={3} maxLength={150} value={form.promptAnswer} onChange={(e) => set('promptAnswer')(e.target.value)} />
                <p className="field-hint">{150 - form.promptAnswer.length} characters left</p>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="alert alert-error" role="alert" style={{ marginTop: '1rem' }}>
            {error}
          </div>
        )}
      </div>

      <div className="onboarding-footer">
        {current === 'verify' ? (
          <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
            I’ll do this later
          </button>
        ) : current === 'photo' && !user.avatarUrl ? (
          <button type="button" className="btn btn-ghost" onClick={next}>
            Skip for now
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={!canContinue || saving} onClick={next}>
            {step === STEPS.length - 1 ? (saving ? 'Saving…' : 'Finish') : 'Continue'}
          </button>
        )}
      </div>
    </div>
  );
}
