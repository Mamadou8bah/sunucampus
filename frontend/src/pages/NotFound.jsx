import { Link } from 'react-router';

export default function NotFound() {
  return (
    <main className="centered-message">
      <h1>Page not found</h1>
      <p>The page you’re looking for doesn’t exist or has moved.</p>
      <Link to="/" className="btn btn-primary">
        Go to home
      </Link>
    </main>
  );
}
