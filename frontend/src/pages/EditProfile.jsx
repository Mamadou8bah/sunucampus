import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import Icon from '../components/Icon.jsx';
import PhotoPicker from '../components/PhotoPicker.jsx';
import Sheet from '../components/Sheet.jsx';
import TagInput from '../components/TagInput.jsx';
import { GOAL_LABELS, YEARS } from '../lib/profile.js';
import { useOptions } from '../lib/useOptions.js';
import Select from '../components/Select.jsx';

/** One editable line: label on the left, borderless input on the right, hairline below. */
function Row({ label, htmlFor, children, error }) {
  return (
    <div className={`ef-row ${error ? 'has-error' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      <div className="ef-row-input">
        {children}
        {error && <p className="field-error">{error}</p>}
      </div>
    </div>
  );
}

/** A row that opens a sheet, showing a preview of the current value. */
function LinkRow({ label, preview, placeholder, onClick }) {
  return (
    <button type="button" className="ef-row ef-link" onClick={onClick}>
      <span className="ef-link-label">{label}</span>
      <span className={`ef-link-value ${preview ? '' : 'is-empty'}`}>{preview || placeholder}</span>
      <Icon name="forward" size={18} className="ef-chevron" />
    </button>
  );
}

export default function EditProfile() {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const options = useOptions();
  const [form, setForm] = useState({
    name: user.name,
    programme: user.programme ?? '',
    yearOfStudy: user.yearOfStudy ?? '',
    bio: user.bio ?? '',
    interests: user.interests ?? [],
    skills: user.skills ?? [],
    goals: user.goals ?? [],
    prompts: user.prompts ?? [],
  });
  const [sheet, setSheet] = useState(null); // 'interests' | 'skills' | { prompt: index }
  const [draftPrompt, setDraftPrompt] = useState({ question: '', answer: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
  const onInput = (e) => set(e.target.name)(e.target.value);
  const toggleGoal = (goal) => set('goals')(form.goals.includes(goal) ? form.goals.filter((g) => g !== goal) : [...form.goals, goal]);

  const used = form.prompts.map((p) => p.question);
  function openPrompt(index) {
    const existing = form.prompts[index];
    const firstFree = options?.prompts?.find((q) => !used.includes(q)) ?? '';
    setDraftPrompt(existing ?? { question: firstFree, answer: '' });
    setSheet({ prompt: index });
  }
  function savePrompt() {
    const index = sheet.prompt;
    const next = [...form.prompts];
    if (draftPrompt.answer.trim()) next[index] = { question: draftPrompt.question, answer: draftPrompt.answer.trim() };
    set('prompts')(next.filter(Boolean));
    setSheet(null);
  }
  function deletePrompt() {
    set('prompts')(form.prompts.filter((_, i) => i !== sheet.prompt));
    setSheet(null);
  }

  async function save() {
    setSaving(true);
    setError('');
    setFieldErrors({});
    try {
      await updateProfile({ ...form, yearOfStudy: form.yearOfStudy === '' ? null : Number(form.yearOfStudy) });
      navigate('/profile');
    } catch (err) {
      const byField = err.fieldErrors?.() ?? {};
      setFieldErrors(byField);
      setError(Object.keys(byField).length ? 'Check the highlighted fields.' : err.message);
      setSaving(false);
    }
  }

  const promptSheetOpen = sheet !== null && typeof sheet === 'object';
  const editingIndex = promptSheetOpen ? sheet.prompt : -1;

  return (
    <main className="ef">
      <header className="ef-bar">
        <button type="button" className="ef-bar-btn" onClick={() => navigate('/profile')}>
          Cancel
        </button>
        <h1>Edit profile</h1>
        <button type="button" className="ef-bar-btn is-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Done'}
        </button>
      </header>

      {error && (
        <p className="ef-error" role="alert">
          {error}
        </p>
      )}

      <div className="ef-photo">
        <PhotoPicker size={96} />
      </div>

      <div className="ef-group">
        <Row label="Name" htmlFor="ef-name" error={fieldErrors.name}>
          <input id="ef-name" name="name" value={form.name} onChange={onInput} autoComplete="name" />
        </Row>
        <Row label="Programme" htmlFor="ef-programme">
          <input id="ef-programme" name="programme" list="ef-programmes" value={form.programme} onChange={onInput} placeholder="Add programme" />
          <datalist id="ef-programmes">
            {options?.programmes.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Row>
        <Row label="Year" htmlFor="ef-year">
          <Select
            id="ef-year"
            label="Year of study"
            variant="quiet"
            value={form.yearOfStudy}
            onChange={(v) => set('yearOfStudy')(v)}
            options={[['', 'Not set'], ...YEARS.map((y) => [y, `Year ${y}`])]}
          />
        </Row>
        <Row label="Bio" htmlFor="ef-bio">
          <textarea id="ef-bio" name="bio" rows={2} maxLength={500} value={form.bio} onChange={onInput} placeholder="A line or two about you" />
        </Row>
      </div>

      <h2 className="ef-heading">Looking for</h2>
      <div className="ef-chips" role="group" aria-label="Looking for">
        {Object.entries(GOAL_LABELS).map(([goal, label]) => (
          <button key={goal} type="button" className={`ef-toggle ${form.goals.includes(goal) ? 'is-on' : ''}`} aria-pressed={form.goals.includes(goal)} onClick={() => toggleGoal(goal)}>
            {form.goals.includes(goal) && <Icon name="check" size={16} strokeWidth={2.6} />}
            {label}
          </button>
        ))}
      </div>

      <h2 className="ef-heading">Prompts</h2>
      <div className="ef-group">
        {form.prompts.map((p, i) => (
          <button key={p.question} type="button" className="ef-row ef-prompt" onClick={() => openPrompt(i)}>
            <span className="ef-prompt-text">
              <span className="ef-prompt-q">{p.question}</span>
              <span className="ef-prompt-a">{p.answer}</span>
            </span>
            <Icon name="forward" size={18} className="ef-chevron" />
          </button>
        ))}
        {form.prompts.length < 3 && (
          <button type="button" className="ef-row ef-add" onClick={() => openPrompt(form.prompts.length)} disabled={!options}>
            <Icon name="plus" size={20} /> Add a prompt
          </button>
        )}
      </div>

      <h2 className="ef-heading">Interests and skills</h2>
      <div className="ef-group">
        <LinkRow label="Interests" preview={form.interests.join(', ')} placeholder="Add interests" onClick={() => setSheet('interests')} />
        <LinkRow label="Skills" preview={form.skills.join(', ')} placeholder="Add skills" onClick={() => setSheet('skills')} />
      </div>

      <Sheet
        open={sheet === 'interests' || sheet === 'skills'}
        onClose={() => setSheet(null)}
        title={sheet === 'skills' ? 'Skills' : 'Interests'}
        footer={
          <button type="button" className="btn btn-primary btn-block" onClick={() => setSheet(null)}>
            Done
          </button>
        }
      >
        {sheet === 'interests' && <TagInput label="Your interests" value={form.interests} onChange={set('interests')} suggestions={options?.interests} />}
        {sheet === 'skills' && <TagInput label="Your skills" value={form.skills} onChange={set('skills')} suggestions={options?.skills} hint="Things you can do or help others with." />}
      </Sheet>

      <Sheet
        open={promptSheetOpen}
        onClose={() => setSheet(null)}
        title={editingIndex < form.prompts.length ? 'Edit prompt' : 'Add a prompt'}
        footer={
          <div className="form-actions">
            {editingIndex < form.prompts.length && (
              <button type="button" className="btn btn-danger-quiet" onClick={deletePrompt}>
                Remove
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={savePrompt} disabled={!draftPrompt.answer.trim()}>
              Save
            </button>
          </div>
        }
      >
        <div className="choice-grid">
          {(options?.prompts ?? [])
            .filter((q) => q === draftPrompt.question || !used.includes(q) || q === form.prompts[editingIndex]?.question)
            .map((q) => (
              <label key={q} className="choice">
                <input type="radio" name="prompt-question" checked={draftPrompt.question === q} onChange={() => setDraftPrompt((d) => ({ ...d, question: q }))} />
                {q}
              </label>
            ))}
        </div>
        <div className="field" style={{ marginTop: '1rem' }}>
          <label htmlFor="ef-answer">Your answer</label>
          <textarea
            id="ef-answer"
            rows={3}
            maxLength={150}
            value={draftPrompt.answer}
            onChange={(e) => setDraftPrompt((d) => ({ ...d, answer: e.target.value }))}
          />
          <p className="field-hint">{150 - draftPrompt.answer.length} characters left</p>
        </div>
      </Sheet>
    </main>
  );
}
