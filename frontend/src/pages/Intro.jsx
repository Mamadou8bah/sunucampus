import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';

export const INTRO_SEEN_KEY = 'sunucampus.introSeen';

/* Illustrations drawn in the brand palette sampled from the SunuCampus mark. */
function PeopleArt() {
  const people = [
    [70, 70, 34, '#e0338f', 'AJ'],
    [175, 52, 28, '#5b8def', 'LT'],
    [250, 120, 38, '#f057bb', 'FC'],
    [120, 160, 30, '#ff8a65', 'EB'],
    [205, 205, 26, '#cc2280', 'MS'],
    [52, 200, 24, '#f080b5', 'IN'],
  ];
  // Demo faces come from `npm run photos:fetch`. Only draw them once they really load;
  // otherwise browsers show a broken-image icon instead of the initials.
  const [faces, setFaces] = useState({});
  useEffect(() => {
    people.forEach((_, n) => {
      const img = new Image();
      img.onload = () => setFaces((f) => ({ ...f, [n]: img.src }));
      img.src = `/intro/face-${n + 1}.jpg`;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <svg viewBox="0 0 300 260" className="intro-art" aria-hidden="true">
      <path d="M70 70 L175 52 L250 120 L205 205 L120 160 Z M120 160 L52 200 M70 70 L120 160" stroke="rgba(255,255,255,0.25)" strokeWidth="2" fill="none" strokeDasharray="4 6" />
      <defs>
        {people.map(([x, y, r], n) => (
          <clipPath key={n} id={`face-clip-${n}`}>
            <circle cx={x} cy={y} r={r} />
          </clipPath>
        ))}
      </defs>
      {people.map(([x, y, r, color, label], n) => (
        <g key={label}>
          <circle cx={x} cy={y} r={r + 5} fill="rgba(255,255,255,0.12)" />
          <circle cx={x} cy={y} r={r} fill={color} />
          <text x={x} y={y + r * 0.22} textAnchor="middle" fontSize={r * 0.62} fontWeight="800" fill="#fff" fontFamily="Manrope Variable, sans-serif">
            {label}
          </text>
          {faces[n] && (
            <image
              href={faces[n]}
              x={x - r}
              y={y - r}
              width={r * 2}
              height={r * 2}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#face-clip-${n})`}
            />
          )}
        </g>
      ))}
    </svg>
  );
}

/** Loads an intro face if it exists; returns null while missing so a colour block shows instead. */
function useFace(n) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setSrc(img.src);
    img.src = `/intro/face-${n}.jpg`;
  }, [n]);
  return src;
}

/** A small stack of match cards, like the real Matches screen. */
function MatchArt() {
  const back = useFace(3);
  const front = useFace(4);
  return (
    <div className="intro-match" aria-hidden="true">
      <div className="intro-card intro-card-back" style={back ? { backgroundImage: `url(${back})` } : undefined} />
      <div className="intro-card intro-card-front" style={front ? { backgroundImage: `url(${front})` } : undefined}>
        <span className="intro-score">
          <strong>86%</strong>
          <span>match</span>
        </span>
        <span className="intro-card-name">
          Ebrima
          <small>Computer Science, year 2</small>
        </span>
      </div>
      <span className="intro-reason intro-reason-1">
        <Icon name="check" size={16} strokeWidth={2.6} /> Both want a study partner
      </span>
      <span className="intro-reason intro-reason-2">
        <Icon name="check" size={16} strokeWidth={2.6} /> Shared skill: Python
      </span>
    </div>
  );
}

/** The same scene as before (chat, a like, communities) but with real content. */
function CampusArt() {
  const face = useFace(1);
  return (
    <div className="intro-campus" aria-hidden="true">
      <div className="intro-msg intro-msg-in">
        <span className="intro-avatar" style={face ? { backgroundImage: `url(${face})` } : undefined} />
        <p>Study group at the library, 4pm?</p>
      </div>
      <div className="intro-msg intro-msg-out">
        <p>I’m in. Bringing my notes</p>
        <span className="intro-seen">Seen</span>
      </div>
      <span className="intro-like">
        <Icon name="heart" size={16} /> 24
      </span>
      <div className="intro-groups">
        {[
          ['U', 'UTG Developers', '#5b8def'],
          ['C', 'Campus Football', '#e0338f'],
          ['L', 'Lens and Light', '#ff8a65'],
        ].map(([letter, name, color]) => (
          <span key={name} className="intro-group">
            <span className="intro-group-mark" style={{ background: color }}>
              {letter}
            </span>
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

const SLIDES = [
  {
    art: <PeopleArt />,
    title: 'Meet people beyond your class',
    text: 'Students from every programme and year, all in one place. Find friends, study partners and teammates you’d never bump into otherwise.',
  },
  {
    art: <MatchArt />,
    title: 'Matches that explain themselves',
    text: 'SunuCampus compares goals, interests and skills, then tells you why you might click. No guesswork.',
  },
  {
    art: <CampusArt />,
    title: 'Your campus, in your pocket',
    text: 'Chat with your connections, join communities and see what’s happening on campus. Verified UTG students get a blue tick.',
  },
];

export default function Intro() {
  const navigate = useNavigate();
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  useEffect(() => {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
  }, []);

  // Keep the dots in step with swiping.
  function onScroll() {
    const el = trackRef.current;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  function goTo(i) {
    const el = trackRef.current;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }

  return (
    <div className="intro">
      <header className="intro-top">
        <Logo size={34} tone="light" />
        {!last && (
          <button type="button" className="link-button intro-skip" onClick={() => navigate('/register')}>
            Skip
          </button>
        )}
      </header>

      <div className="intro-track" ref={trackRef} onScroll={onScroll} aria-roledescription="carousel" aria-label="About SunuCampus">
        {SLIDES.map((s, i) => (
          <section key={s.title} className="intro-slide" aria-roledescription="slide" aria-label={`${i + 1} of ${SLIDES.length}`} aria-hidden={i !== index}>
            <div className="intro-art-wrap">{s.art}</div>
            <div className="intro-copy">
              <h1>{s.title}</h1>
              <p>{s.text}</p>
            </div>
          </section>
        ))}
      </div>

      <footer className="intro-footer">
        <div className="intro-dots" role="tablist" aria-label="Choose a screen">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Screen ${i + 1}`}
              className={i === index ? 'is-active' : undefined}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
        {last ? (
          <>
            <Link to="/register" className="btn btn-light btn-block">
              Create an account
            </Link>
            <Link to="/login" className="intro-login">
              I already have an account
            </Link>
          </>
        ) : (
          <button type="button" className="btn btn-light btn-block" onClick={() => goTo(index + 1)}>
            Next
          </button>
        )}
      </footer>
    </div>
  );
}
