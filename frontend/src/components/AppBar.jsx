import { useNavigate } from 'react-router';
import Icon from './Icon.jsx';

/**
 * The top bar of every screen. `large` shows a big left-aligned title (top-level tabs);
 * otherwise a compact centred title with a back button (pushed screens).
 */
export default function AppBar({ title, large = false, back, actions, children }) {
  const navigate = useNavigate();
  const goBack = () => (typeof back === 'string' ? navigate(back) : navigate(-1));

  return (
    <header className={`appbar ${large ? 'appbar-large' : ''}`}>
      <div className="appbar-row">
        {back && (
          <button type="button" className="icon-button appbar-back" onClick={goBack} aria-label="Back">
            <Icon name="back" />
          </button>
        )}
        {title ? <h1 className="appbar-title">{title}</h1> : <span className="appbar-title" aria-hidden="true" />}
        <div className="appbar-actions">{actions}</div>
      </div>
      {children}
    </header>
  );
}
