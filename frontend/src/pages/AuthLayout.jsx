import Logo from '../components/Logo.jsx';

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth">
      <section className="auth-hero">
        <Logo size={40} tone="light" />
        <h1>Your people are already on campus.</h1>
        <p>Find study partners, teammates and friends across every programme at UTG.</p>
      </section>
      <main className="auth-body">
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </main>
    </div>
  );
}
